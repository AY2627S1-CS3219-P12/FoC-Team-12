package com.friendoncampus.user.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.user.service.PasswordResetService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
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
    @ApiResponse(responseCode = "202", description = "Same response for known and unknown email addresses")
    public ResponseEntity<Void> request(@Valid @RequestBody PasswordResetRequest request) {
        passwordResets.request(request.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/password-reset-confirmations")
    @Operation(summary = "Confirm a password reset code and change the password")
    @ApiResponse(responseCode = "204", description = "Password changed; reset code consumed")
    @ApiResponse(responseCode = "400", description = "Invalid, expired, replayed, or exhausted code or invalid password")
    public ResponseEntity<Void> confirm(@Valid @RequestBody PasswordResetConfirmation confirmation) {
        passwordResets.confirm(confirmation.email(), confirmation.code(), confirmation.password());
        return ResponseEntity.noContent().build();
    }

    public record PasswordResetRequest(@NotBlank @Email String email) {
    }

    public record PasswordResetConfirmation(@NotBlank @Email String email,
            @NotBlank @Pattern(regexp = "\\d{6}") String code,
            @NotBlank @Size(min = 15, max = 64) String password) {
    }
}
