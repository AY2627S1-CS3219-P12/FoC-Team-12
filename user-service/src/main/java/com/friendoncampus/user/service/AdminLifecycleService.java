package com.friendoncampus.user.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.user.domain.AdminLifecycleState;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.AdminLifecycleStateRepository;
import com.friendoncampus.user.repository.UserRepository;

/** ADMIN-only role and lifecycle operations, serialized to preserve the final active administrator. */
@Service
public class AdminLifecycleService {
    private final AdminLifecycleStateRepository lifecycleState;
    private final UserRepository users;

    public AdminLifecycleService(AdminLifecycleStateRepository lifecycleState, UserRepository users) {
        this.lifecycleState = lifecycleState;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public Page<User> list(UUID actorId, String query, Pageable pageable) {
        requireActiveAdmin(actorId);
        return query == null || query.isBlank() ? users.findAll(pageable) : users.searchByEmailOrUsername(query.trim(), pageable);
    }

    @Transactional
    public User promote(UUID actorId, UUID targetId) {
        User target = beginChange(actorId, targetId);
        requireActive(target);
        if (target.getRole() != UserRole.USER) {
            throw new AdminLifecycleException("Account is already an administrator");
        }
        target.promoteToAdmin();
        return users.save(target);
    }

    @Transactional
    public User demote(UUID actorId, UUID targetId) {
        User target = beginChange(actorId, targetId);
        requireActive(target);
        if (target.getRole() != UserRole.ADMIN) {
            throw new AdminLifecycleException("Account is not an administrator");
        }
        requireAnotherActiveAdmin();
        target.demoteToUser();
        return users.save(target);
    }

    @Transactional
    public User ban(UUID actorId, UUID targetId) {
        User target = beginChange(actorId, targetId);
        requireActive(target);
        if (target.getRole() == UserRole.ADMIN) {
            requireAnotherActiveAdmin();
        }
        target.ban();
        return users.save(target);
    }

    @Transactional
    public User reactivate(UUID actorId, UUID targetId) {
        User target = beginChange(actorId, targetId);
        if (target.getStatus() != UserStatus.BANNED) {
            throw new AdminLifecycleException("Only banned accounts can be reactivated");
        }
        target.activate();
        return users.save(target);
    }

    private User beginChange(UUID actorId, UUID targetId) {
        lifecycleState.lockForLifecycleChange(AdminLifecycleState.ID)
                .orElseThrow(() -> new IllegalStateException("Administrator lifecycle state is missing"));
        User actor = requireActiveAdmin(actorId);
        User target = users.findById(targetId).orElseThrow(AdminAccountNotFoundException::new);
        if (actor.getId().equals(target.getId())) {
            throw new AdminLifecycleException("Administrators cannot revoke their own access");
        }
        return target;
    }

    private User requireActiveAdmin(UUID actorId) {
        User actor = users.findById(actorId).orElseThrow(() -> new AdminAccessDeniedException("Administrator access is required"));
        if (actor.getRole() != UserRole.ADMIN || actor.getStatus() != UserStatus.ACTIVE) {
            throw new AdminAccessDeniedException("Administrator access is required");
        }
        return actor;
    }

    private void requireActive(User target) {
        if (target.getStatus() != UserStatus.ACTIVE) {
            throw new AdminLifecycleException("Only active accounts can be changed");
        }
    }

    private void requireAnotherActiveAdmin() {
        if (users.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE) <= 1) {
            throw new AdminLifecycleException("The final active administrator cannot be changed");
        }
    }
}
