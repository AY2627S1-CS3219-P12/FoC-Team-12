package com.friendoncampus.user.web;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

/**
 * Temporary authenticated endpoint for JWT validation. Replace it with the User profile endpoint
 * when profile retrieval is implemented.
 */
@RestController
@RequestMapping("/api/users")
public class CurrentUserController {

    @GetMapping("/me")
    @Operation(summary = "Return the authenticated token identity (temporary validation endpoint)")
    @SecurityRequirement(name = "bearerAuth")
    public Response currentUser(@AuthenticationPrincipal Jwt jwt) {
        return new Response(UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("username"),
                jwt.getClaimAsString("role"));
    }

    public record Response(UUID userId, String username, String role) {
    }
}
