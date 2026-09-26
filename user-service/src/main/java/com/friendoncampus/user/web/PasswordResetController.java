package com.friendoncampus.user.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.user.service.PasswordResetService;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/users")
public class PasswordResetController {
    private final PasswordResetService passwordResets;

    public PasswordResetController(PasswordResetService passwordResets) {
        this.passwordResets = passwordResets;
    }

    @PostMapping("/password-reset-requests")
    @Operation(summary = "Request a password reset code")
    public ResponseEntity<Void> request(@Valid @RequestBody PasswordResetRequest request) {
        passwordResets.request(request.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/password-reset-confirmations")
    @Operation(summary = "Confirm a password reset code and change the password")
    public ResponseEntity<Void> confirm(@Valid @RequestBody PasswordResetConfirmation confirmation) {
        passwordResets.confirm(confirmation.email(), confirmation.code(), confirmation.password());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password-reset-verifications")
    @Operation(summary = "Validate a password reset code before choosing a new password")
    public ResponseEntity<Void> verify(@Valid @RequestBody PasswordResetVerification verification) {
        passwordResets.verify(verification.email(), verification.code());
        return ResponseEntity.noContent().build();
    }

    public record PasswordResetRequest(@NotBlank @Email String email) {
    }

    public record PasswordResetConfirmation(@NotBlank @Email String email,
            @NotBlank @Pattern(regexp = "\\d{6}") String code,
            @NotBlank @Size(min = 15, max = 64) String password) {
    }

    public record PasswordResetVerification(@NotBlank @Email String email,
            @NotBlank @Pattern(regexp = "\\d{6}") String code) {
    }
}
