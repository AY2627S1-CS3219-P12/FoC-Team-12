package com.friendoncampus.user.web;

import java.time.Instant;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.user.service.LoginService;

import io.swagger.v3.oas.annotations.Operation;

@RestController
@RequestMapping("/api/users")
public class LoginController {
    private final LoginService loginService;

    public LoginController(LoginService loginService) {
        this.loginService = loginService;
    }

    @PostMapping("/login")
    @Operation(summary = "Log in and receive a 15-minute RS256 access token")
    public ResponseEntity<Response> login(@RequestBody Request request) {
        LoginService.LoginResult login = loginService.login(request.email(), request.password());
        return ResponseEntity.ok(new Response(login));
    }

    public record Request(String email, String password) {
    }

    public record Response(String accessToken, String tokenType, Instant expiresAt, UUID userId, String username,
            String role) {
        Response(LoginService.LoginResult login) {
            this(login.token().value(), "Bearer", login.token().expiresAt(), login.user().getId(),
                    login.user().getUsername(), login.user().getRole().name());
        }
    }
}
