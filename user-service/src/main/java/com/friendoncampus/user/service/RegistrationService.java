package com.friendoncampus.user.service;

import java.util.Locale;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;

@Service
public class RegistrationService {
    private final UserRepository users; private final PasswordEncoder passwordEncoder;
    public RegistrationService(UserRepository users, PasswordEncoder passwordEncoder) { this.users = users; this.passwordEncoder = passwordEncoder; }
    public User register(String email, String username, String password) {
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        String normalizedUsername = username.toLowerCase(Locale.ROOT);
        if (!normalizedEmail.endsWith("@u.nus.edu") && !normalizedEmail.endsWith("@u.duke.nus.edu") && !normalizedEmail.endsWith("@u.yale-nus.edu.sg")) throw new IllegalArgumentException("email must use an eligible NUS student domain");
        if (users.findByEmail(normalizedEmail).isPresent()) throw new DuplicateRegistrationException("email");
        if (users.findByUsernameNormalized(normalizedUsername).isPresent()) throw new DuplicateRegistrationException("username");
        return users.save(User.register(normalizedEmail, username, normalizedUsername, passwordEncoder.encode(password)));
    }
}
