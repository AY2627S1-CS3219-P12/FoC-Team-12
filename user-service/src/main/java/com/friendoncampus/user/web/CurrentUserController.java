package com.friendoncampus.user.web;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.service.UsernameChangeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/users")
public class CurrentUserController {
    private final UserRepository users;
    private final UsernameChangeService usernameChanges;

    public CurrentUserController(UserRepository users, UsernameChangeService usernameChanges) {
        this.users = users;
        this.usernameChanges = usernameChanges;
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

    @PatchMapping("/me/username")
    @Operation(summary = "Change the authenticated user's username")
    @ApiResponse(responseCode = "200", description = "Persisted profile with its updated username")
    @ApiResponse(responseCode = "400", description = "Username is blank or longer than 20 characters")
    @ApiResponse(responseCode = "409", description = "Username is already taken")
    @ApiResponse(responseCode = "401", description = "Missing or invalid bearer token")
    @SecurityRequirement(name = "bearerAuth")
    public Response changeUsername(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UsernameChange request) {
        User user = usernameChanges.changeUsername(UUID.fromString(jwt.getSubject()), request.username());
        return responseFor(user);
    }

    private Response responseFor(User user) {
        return new Response(user.getId(), user.getEmail(), user.getUsername(), user.getRole().name(),
                user.getStatus().name(), user.getCreatedAt());
    }

    public record UsernameChange(@NotBlank @Size(max = 20) String username) {
    }

    public record Response(UUID userId, String email, String username, String role, String status,
            java.time.OffsetDateTime createdAt) {
    }
}
