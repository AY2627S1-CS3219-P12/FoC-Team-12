package com.friendoncampus.user.service;

import java.security.SecureRandom;
import java.time.*;
import java.util.Locale;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.friendoncampus.user.domain.*;
import com.friendoncampus.user.repository.*;

@Service
public class EmailVerificationService {
    private final UserRepository users; private final EmailVerificationAttemptRepository attempts; private final PasswordEncoder passwords; private final EmailVerificationMailer mailer; private final Clock clock; private final SecureRandom random = new SecureRandom();
    public EmailVerificationService(UserRepository users, EmailVerificationAttemptRepository attempts, PasswordEncoder passwords, EmailVerificationMailer mailer, Clock clock) { this.users = users; this.attempts = attempts; this.passwords = passwords; this.mailer = mailer; this.clock = clock; }

    public void issueInitial(User user) { issue(user, now()); }

    @Transactional(noRollbackFor = EmailVerificationDeliveryException.class)
    public void resend(String email) {
        User user = users.findByEmail(normalizeEmail(email)).orElseThrow(EmailVerificationNotFoundException::new);
        if (user.getStatus() == UserStatus.ACTIVE) throw new EmailAlreadyVerifiedException();
        if (user.getStatus() == UserStatus.BANNED) throw new EmailVerificationForbiddenException();
        OffsetDateTime now = now();
        attempts.findFirstByUser_IdAndSentAtIsNotNullOrderBySentAtDesc(user.getId()).ifPresent(previous -> {
            Duration remaining = Duration.between(now, previous.getSentAt().plusSeconds(90));
            if (!remaining.isNegative() && !remaining.isZero()) throw new EmailVerificationCooldownException((remaining.toMillis() + 999) / 1000);
        });
        issue(user, now);
    }

    @Transactional
    public void verify(String email, String code) {
        User user = users.findByEmail(normalizeEmail(email)).orElseThrow(InvalidEmailVerificationCodeException::new);
        if (user.getStatus() != UserStatus.UNVERIFIED) throw new InvalidEmailVerificationCodeException();
        EmailVerificationAttempt attempt = attempts.findFirstByUser_IdAndSentAtIsNotNullAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId()).orElseThrow(InvalidEmailVerificationCodeException::new);
        if (!attempt.isUsableAt(now())) throw new InvalidEmailVerificationCodeException();
        if (!passwords.matches(code, attempt.getVerifier())) { attempt.recordFailedAttempt(); attempts.save(attempt); throw new InvalidEmailVerificationCodeException(); }
        attempt.markUsed(now()); user.activate(); attempts.save(attempt); users.save(user);
    }

    private void issue(User user, OffsetDateTime now) {
        String code = String.format("%06d", random.nextInt(1_000_000));
        attempts.invalidateActiveForUser(user.getId(), now);
        EmailVerificationAttempt attempt = attempts.save(EmailVerificationAttempt.issue(user, passwords.encode(code), now));
        try { mailer.sendVerificationCode(user.getEmail(), code); attempt.markSent(now); }
        catch (RuntimeException exception) { throw new EmailVerificationDeliveryException(exception); }
    }
    private OffsetDateTime now() { return OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC); }
    private String normalizeEmail(String email) { return email == null ? "" : email.trim().toLowerCase(Locale.ROOT); }
}
