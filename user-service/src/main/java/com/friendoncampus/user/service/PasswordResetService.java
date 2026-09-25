package com.friendoncampus.user.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.friendoncampus.user.domain.PasswordResetToken;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.PasswordResetTokenRepository;
import com.friendoncampus.user.repository.UserRepository;

@Service
public class PasswordResetService {
    private static final int CODE_BOUND = 1_000_000;
    private static final int CODE_LENGTH = 6;

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetMailer mailer;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public PasswordResetService(UserRepository users, PasswordResetTokenRepository tokens, PasswordEncoder passwordEncoder,
            PasswordResetMailer mailer, Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.passwordEncoder = passwordEncoder;
        this.mailer = mailer;
        this.clock = clock;
    }

    @Transactional
    public void request(String email) {
        User user = users.findByEmail(normalizeEmail(email)).orElse(null);
        if (user == null || user.getStatus() != UserStatus.ACTIVE) {
            return;
        }

        OffsetDateTime now = now();
        String code = generateCode();
        tokens.invalidateActiveForUser(user.getId(), now);
        tokens.save(PasswordResetToken.issue(user, passwordEncoder.encode(code), now, now.plusMinutes(10)));
        mailer.sendPasswordResetCode(user.getEmail(), code);
    }

    @Transactional
    public void confirm(String email, String code, String newPassword) {
        User user = users.findByEmail(normalizeEmail(email)).orElse(null);
        if (user == null || user.getStatus() != UserStatus.ACTIVE) {
            throw new InvalidPasswordResetCodeException();
        }

        PasswordResetToken token = tokens
                .findFirstByUser_IdAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId())
                .orElseThrow(InvalidPasswordResetCodeException::new);
        OffsetDateTime now = now();
        if (!token.isUsableAt(now)) {
            throw new InvalidPasswordResetCodeException();
        }
        if (!passwordEncoder.matches(code, token.getVerifier())) {
            token.recordFailedAttempt();
            tokens.save(token);
            throw new InvalidPasswordResetCodeException();
        }

        user.changePasswordHash(passwordEncoder.encode(newPassword));
        token.markUsed(now);
        users.save(user);
        tokens.save(token);
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC);
    }

    private String generateCode() {
        return String.format("%0" + CODE_LENGTH + "d", random.nextInt(CODE_BOUND));
    }
}
