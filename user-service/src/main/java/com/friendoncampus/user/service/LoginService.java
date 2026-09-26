package com.friendoncampus.user.service;

import java.util.Locale;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.UserRepository;

@Service
public class LoginService {
    private static final String DUMMY_PASSWORD_HASH = "$2a$10$8LrWOCIf0XzW55OQ6J3Y2eTpwQG5dZJXWcd6D.4GzZ3SgNqg7EFAq";

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenService tokens;

    public LoginService(UserRepository users, PasswordEncoder passwordEncoder, JwtTokenService tokens) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
    }

    public LoginResult login(String email, String password) {
        if (email == null || password == null) {
            throw new InvalidCredentialsException();
        }
        User user = users.findByEmail(email.trim().toLowerCase(Locale.ROOT)).orElse(null);
        boolean passwordMatches = passwordEncoder.matches(password,
                user == null ? DUMMY_PASSWORD_HASH : user.getPasswordHash());
        if (user == null || !passwordMatches || user.getStatus() == UserStatus.BANNED) {
            throw new InvalidCredentialsException();
        }
        if (user.getStatus() == UserStatus.UNVERIFIED) {
            throw new EmailVerificationRequiredException();
        }
        return new LoginResult(user, tokens.issue(user));
    }

    public record LoginResult(User user, JwtTokenService.IssuedToken token) {
    }
}
