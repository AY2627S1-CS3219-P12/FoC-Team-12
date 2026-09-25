package com.friendoncampus.user.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.friendoncampus.user.service.EmailVerificationService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

@RestController @RequestMapping("/api/users")
public class EmailVerificationController {
    private final EmailVerificationService verifications;
    public EmailVerificationController(EmailVerificationService verifications) { this.verifications = verifications; }
    @PostMapping("/email-verifications") @Operation(summary = "Verify a registered NUS email address")
    public ResponseEntity<Void> verify(@Valid @RequestBody Verification request) { verifications.verify(request.email(), request.code()); return ResponseEntity.noContent().build(); }
    @PostMapping("/email-verification-resends") @Operation(summary = "Resend an email verification code after the cooldown")
    public ResponseEntity<Void> resend(@Valid @RequestBody Resend request) { verifications.resend(request.email()); return ResponseEntity.accepted().build(); }
    public record Verification(@NotBlank @Email String email, @NotBlank @Pattern(regexp = "\\d{6}") String code) { }
    public record Resend(@NotBlank @Email String email) { }
}
