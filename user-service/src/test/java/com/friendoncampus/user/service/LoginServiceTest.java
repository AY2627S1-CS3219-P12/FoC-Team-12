package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class LoginServiceTest {
    @Mock UserRepository users;
    @Mock PasswordEncoder passwords;
    @Mock JwtTokenService tokens;
    @InjectMocks LoginService service;

    @Test
    void authenticatesAnActiveUserWithMatchingPassword() {
        User user = User.register("alice@u.nus.edu", "Alice", "alice", "hash");
        user.activate();
        JwtTokenService.IssuedToken token = new JwtTokenService.IssuedToken("signed.jwt", Instant.now().plusSeconds(900));
        when(users.findByEmail("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(passwords.matches("password", "hash")).thenReturn(true);
        when(tokens.issue(user)).thenReturn(token);

        LoginService.LoginResult result = service.login(" Alice@U.NUS.EDU ", "password");

        assertThat(result.user()).isSameAs(user);
        assertThat(result.token()).isEqualTo(token);
    }

    @Test
    void givesTheSameFailureForUnknownEmailAndBadPassword() {
        when(users.findByEmail("missing@u.nus.edu")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.login("missing@u.nus.edu", "password"))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid email or password");

        User user = User.register("alice@u.nus.edu", "Alice", "alice", "hash");
        when(users.findByEmail("alice@u.nus.edu")).thenReturn(Optional.of(user));
        when(passwords.matches("wrong", "hash")).thenReturn(false);
        assertThatThrownBy(() -> service.login("alice@u.nus.edu", "wrong"))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid email or password");
    }

    @Test
    void givesTheSameFailureForBannedAccountsAfterCheckingThePassword() {
        User banned = mock(User.class);
        when(banned.getStatus()).thenReturn(UserStatus.BANNED);
        when(banned.getPasswordHash()).thenReturn("hash");
        when(users.findByEmail("banned@u.nus.edu")).thenReturn(Optional.of(banned));
        when(passwords.matches("password", "hash")).thenReturn(true);

        assertThatThrownBy(() -> service.login("banned@u.nus.edu", "password"))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid email or password");
        verify(passwords).matches("password", "hash");
        verifyNoInteractions(tokens);
    }

    @Test
    void requiresEmailVerificationOnlyAfterTheCorrectPasswordWasProvided() {
        User unverified = User.register("alice@u.nus.edu", "Alice", "alice", "hash");
        when(users.findByEmail("alice@u.nus.edu")).thenReturn(Optional.of(unverified));
        when(passwords.matches("password", "hash")).thenReturn(true);

        assertThatThrownBy(() -> service.login("alice@u.nus.edu", "password"))
                .isInstanceOf(EmailVerificationRequiredException.class)
                .hasMessage("Email verification is required before signing in");
        verify(passwords).matches("password", "hash");
        verifyNoInteractions(tokens);
    }

    @Test
    void keepsTheGenericFailureWhenAnUnverifiedAccountsPasswordIsWrong() {
        User unverified = User.register("alice@u.nus.edu", "Alice", "alice", "hash");
        when(users.findByEmail("alice@u.nus.edu")).thenReturn(Optional.of(unverified));
        when(passwords.matches("wrong", "hash")).thenReturn(false);

        assertThatThrownBy(() -> service.login("alice@u.nus.edu", "wrong"))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid email or password");
        verifyNoInteractions(tokens);
    }
}
