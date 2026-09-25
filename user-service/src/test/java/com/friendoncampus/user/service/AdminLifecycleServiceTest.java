package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.user.domain.AdminLifecycleState;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.AdminLifecycleStateRepository;
import com.friendoncampus.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class AdminLifecycleServiceTest {
    @Mock AdminLifecycleStateRepository lifecycleState;
    @Mock UserRepository users;
    private AdminLifecycleService service;
    private User actor;
    private User target;

    @BeforeEach
    void setUp() {
        service = new AdminLifecycleService(lifecycleState, users);
        actor = activeAdmin("admin@u.nus.edu", "Admin", "admin");
        target = activeUser("member@u.nus.edu", "Member", "member");
        lenient().when(lifecycleState.lockForLifecycleChange(AdminLifecycleState.ID)).thenReturn(Optional.of(mock(AdminLifecycleState.class)));
        lenient().when(users.findById(actor.getId())).thenReturn(Optional.of(actor));
        lenient().when(users.findById(target.getId())).thenReturn(Optional.of(target));
        lenient().when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void promotesAndDemotesAnActiveAccount() {
        User promoted = service.promote(actor.getId(), target.getId());
        assertThat(promoted.getRole()).isEqualTo(UserRole.ADMIN);

        when(users.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(2L);
        User demoted = service.demote(actor.getId(), target.getId());
        assertThat(demoted.getRole()).isEqualTo(UserRole.USER);
    }

    @Test
    void bansAndReactivatesOnlyAnActiveAccount() {
        User banned = service.ban(actor.getId(), target.getId());
        assertThat(banned.getStatus()).isEqualTo(UserStatus.BANNED);

        User reactivated = service.reactivate(actor.getId(), target.getId());
        assertThat(reactivated.getStatus()).isEqualTo(UserStatus.ACTIVE);
    }

    @Test
    void rejectsSelfRevocationAndUnverifiedTargets() {
        when(users.findById(actor.getId())).thenReturn(Optional.of(actor));
        assertThatThrownBy(() -> service.demote(actor.getId(), actor.getId()))
                .isInstanceOf(AdminLifecycleException.class).hasMessageContaining("cannot revoke their own");

        User unverified = User.register("unverified@u.nus.edu", "Unverified", "unverified", "hash");
        when(users.findById(unverified.getId())).thenReturn(Optional.of(unverified));
        assertThatThrownBy(() -> service.ban(actor.getId(), unverified.getId()))
                .isInstanceOf(AdminLifecycleException.class).hasMessageContaining("Only active accounts");
    }

    @Test
    void protectsTheFinalActiveAdministratorFromDemotionAndBan() {
        target.promoteToAdmin();
        when(users.countByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(1L);

        assertThatThrownBy(() -> service.demote(actor.getId(), target.getId()))
                .isInstanceOf(AdminLifecycleException.class).hasMessageContaining("final active administrator");
        assertThatThrownBy(() -> service.ban(actor.getId(), target.getId()))
                .isInstanceOf(AdminLifecycleException.class).hasMessageContaining("final active administrator");
    }

    @Test
    void rejectsAStaleOrBannedAdministratorEvenWhenTheirJwtRoleWasAdmin() {
        actor.ban();

        assertThatThrownBy(() -> service.promote(actor.getId(), target.getId()))
                .isInstanceOf(AdminAccessDeniedException.class).hasMessageContaining("Administrator access");
    }

    private User activeUser(String email, String username, String normalizedUsername) {
        User user = User.register(email, username, normalizedUsername, "hash");
        user.activate();
        return user;
    }

    private User activeAdmin(String email, String username, String normalizedUsername) {
        User user = activeUser(email, username, normalizedUsername);
        user.promoteToAdmin();
        return user;
    }
}
