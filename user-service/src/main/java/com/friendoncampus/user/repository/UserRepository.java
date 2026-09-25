package com.friendoncampus.user.repository;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    Optional<User> findByUsernameNormalized(String usernameNormalized);
    Optional<User> findFirstByRole(UserRole role);
}
