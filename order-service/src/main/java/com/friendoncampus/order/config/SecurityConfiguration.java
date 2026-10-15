package com.friendoncampus.order.config;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.util.StringUtils;

import com.friendoncampus.order.web.error.ProblemSecurityHandler;

/**
 * Validates User Service JWTs and derives the caller identity from the verified {@code sub}
 * claim. Identity is never taken from the request body or a header.
 *
 * <p>The token contract (HS256 shared secret, {@code sub}=user UUID, {@code roles}, {@code iss},
 * {@code exp}) is configured via properties so it can track the User Service contract once the
 * User Service owner ratifies it. See the service README.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfiguration {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtDecoder jwtDecoder,
            JwtAuthenticationConverter jwtAuthenticationConverter,
            ProblemSecurityHandler problemSecurityHandler) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .authenticationEntryPoint(problemSecurityHandler)
                        .accessDeniedHandler(problemSecurityHandler)
                        .jwt(jwt -> jwt
                                .decoder(jwtDecoder)
                                .jwtAuthenticationConverter(jwtAuthenticationConverter)))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(problemSecurityHandler)
                        .accessDeniedHandler(problemSecurityHandler));
        return http.build();
    }

    /**
     * HS256 decoder keyed by the shared secret. Enforces the standard timestamp checks plus the
     * expected issuer, and rejects any token whose {@code sub} is not a valid user UUID so the
     * controller can trust {@code jwt.getSubject()}.
     */
    @Bean
    public JwtDecoder jwtDecoder(
            @Value("${order.security.jwt.secret:}") String secret,
            @Value("${order.security.jwt.issuer:user-service}") String issuer) {
        if (!StringUtils.hasText(secret)) {
            throw new IllegalStateException(
                    "order.security.jwt.secret (env JWT_SECRET) must be set to validate User Service JWTs");
        }
        SecretKeySpec key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer),
                subjectIsUserUuid()));
        return decoder;
    }

    private static OAuth2TokenValidator<Jwt> subjectIsUserUuid() {
        return jwt -> {
            String subject = jwt.getSubject();
            if (subject != null) {
                try {
                    UUID.fromString(subject);
                    return OAuth2TokenValidatorResult.success();
                } catch (IllegalArgumentException ignored) {
                    // fall through to failure
                }
            }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error(
                    "invalid_token", "JWT 'sub' claim must be a user UUID", null));
        };
    }

    /**
     * Maps the {@code roles} claim ({@code ["USER", ...]}) to {@code ROLE_*} authorities so
     * per-endpoint role checks are available; the principal name stays the {@code sub} claim.
     */
    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Object rolesClaim = jwt.getClaim("roles");
            if (!(rolesClaim instanceof Collection<?> roles)) {
                return List.of();
            }
            return roles.stream()
                    .filter(Objects::nonNull)
                    .map(Object::toString)
                    .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                    .collect(Collectors.toList());
        });
        return converter;
    }
}
