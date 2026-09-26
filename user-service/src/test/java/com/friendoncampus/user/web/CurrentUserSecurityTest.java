package com.friendoncampus.user.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.JwtTestProperties;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:security;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password="
})
@AutoConfigureMockMvc
class CurrentUserSecurityTest {
    private static final String ISSUER = "friend-on-campus-user-service";
    private static final String AUDIENCE = "friend-on-campus-api";

    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;
    @Autowired JwtDecoder decoder;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @Test
    void issuesAVerifiableTokenForValidLogin() throws Exception {
        String email = "login-" + UUID.randomUUID() + "@u.nus.edu";
        User user = User.register(email, "Alice", "alice" + UUID.randomUUID().toString().substring(0, 8),
                passwords.encode("password-with-at-least-15-chars"));
        user.activate();
        users.save(user);

        MvcResult result = mvc.perform(post("/api/users/login").contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"password\":\"password-with-at-least-15-chars\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.userId").value(user.getId().toString()))
                .andReturn();

        String token = result.getResponse().getContentAsString()
                .replaceFirst(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        assertThat(decoder.decode(token).getSubject()).isEqualTo(user.getId().toString());
    }

    @Test
    void returnsThePersistedProfileForTheAuthenticatedUser() throws Exception {
        User user = User.register("profile-" + UUID.randomUUID() + "@u.nus.edu", "Persisted Alice",
                "persisted" + UUID.randomUUID().toString().substring(0, 8), passwords.encode("password-with-at-least-15-chars"));
        user.activate();
        users.save(user);

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                Instant.now().plusSeconds(60), user.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId().toString()))
                .andExpect(jsonPath("$.email").value(user.getEmail()))
                .andExpect(jsonPath("$.username").value("Persisted Alice"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.createdAt").exists());
    }

    @Test
    void rejectsExpiredMalformedWrongIssuerAndWrongAudienceTokens() throws Exception {
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                Instant.now().minusSeconds(60), UUID.randomUUID()))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer not-a-jwt")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token("other-issuer", List.of(AUDIENCE),
                Instant.now().plusSeconds(60), UUID.randomUUID()))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token(ISSUER, List.of("other-audience"),
                Instant.now().plusSeconds(60), UUID.randomUUID()))).andExpect(status().isUnauthorized());
    }

    @Test
    void publishesOnlyPublicJwkMaterial() throws Exception {
        mvc.perform(get("/.well-known/jwks.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
                .andExpect(jsonPath("$.keys[0].kid").value("user-service-rs256-1"))
                .andExpect(jsonPath("$.keys[0].d").doesNotExist());
    }

    @Test
    void permitsPasswordResetCodeValidationWithoutAnAccessToken() throws Exception {
        mvc.perform(post("/api/users/password-reset-verifications").contentType("application/json")
                        .content("{\"email\":\"missing@u.nus.edu\",\"code\":\"123456\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Invalid or expired password reset code"));
    }

    private String token(String issuer, List<String> audience, Instant expiresAt, UUID userId) {
        Instant issuedAt = expiresAt.isBefore(Instant.now()) ? expiresAt.minusSeconds(60) : Instant.now().minusSeconds(1);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject(userId.toString())
                .audience(audience)
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("username", "Alice")
                .claim("role", "USER")
                .build();
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(SignatureAlgorithm.RS256).keyId("user-service-rs256-1").build(), claims)).getTokenValue();
    }
}
