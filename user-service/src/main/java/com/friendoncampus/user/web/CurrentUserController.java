package com.friendoncampus.user.web;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

@RestController
@RequestMapping("/api/users")
public class CurrentUserController {
    private final UserRepository users;

    public CurrentUserController(UserRepository users) {
        this.users = users;
    }

    @GetMapping("/me")
    @Operation(summary = "Return the authenticated user's persisted profile")
    @ApiResponse(responseCode = "200", description = "View-only persisted profile")
    @ApiResponse(responseCode = "401", description = "Missing or invalid bearer token")
    @SecurityRequirement(name = "bearerAuth")
    public Response currentUser(@AuthenticationPrincipal Jwt jwt) {
        UUID userId = UUID.fromString(jwt.getSubject());
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found"));
        return new Response(user.getId(), user.getEmail(), user.getUsername(), user.getRole().name(),
                user.getStatus().name(), user.getCreatedAt());
    }

    public record Response(UUID userId, String email, String username, String role, String status,
            java.time.OffsetDateTime createdAt) {
    }
}
