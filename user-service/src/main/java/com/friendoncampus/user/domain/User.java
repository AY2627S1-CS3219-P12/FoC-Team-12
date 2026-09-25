package com.friendoncampus.user.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.*;

@Entity
@Table(name = "users")
public class User {
    @Id private UUID id;
    @Column(nullable = false, unique = true, length = 254) private String email;
    @Column(nullable = false, length = 20) private String username;
    @Column(name = "username_normalized", nullable = false, unique = true, length = 20) private String usernameNormalized;
    @Column(name = "password_hash", nullable = false, length = 100) private String passwordHash;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private UserRole role;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private UserStatus status;
    @Column(name = "created_at", nullable = false) private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private OffsetDateTime updatedAt;
    protected User() { }
    public static User register(String email, String username, String normalizedUsername, String passwordHash) {
        User user = new User(); user.id = UUID.randomUUID(); user.email = email; user.username = username;
        user.usernameNormalized = normalizedUsername; user.passwordHash = passwordHash; user.role = UserRole.USER;
        user.status = UserStatus.UNVERIFIED; OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC); user.createdAt = now; user.updatedAt = now;
        return user;
    }
    public UUID getId() { return id; } public String getEmail() { return email; } public String getUsername() { return username; }
    public String getPasswordHash() { return passwordHash; }
    public UserRole getRole() { return role; } public UserStatus getStatus() { return status; } public OffsetDateTime getCreatedAt() { return createdAt; }

    public void changePasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public void activate() {
        this.status = UserStatus.ACTIVE;
        this.updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
