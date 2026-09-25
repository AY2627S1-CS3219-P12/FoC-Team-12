package com.friendoncampus.user.repository;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    Optional<User> findByUsernameNormalized(String usernameNormalized);
    Optional<User> findFirstByRole(UserRole role);
    long countByRoleAndStatus(UserRole role, com.friendoncampus.user.domain.UserStatus status);
    @Query("select user from User user where lower(user.email) like lower(concat('%', :query, '%')) or lower(user.username) like lower(concat('%', :query, '%'))")
    Page<User> searchByEmailOrUsername(@org.springframework.data.repository.query.Param("query") String query, Pageable pageable);
}
