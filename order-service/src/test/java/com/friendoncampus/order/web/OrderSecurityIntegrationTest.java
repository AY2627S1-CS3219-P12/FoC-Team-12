package com.friendoncampus.order.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.OrderService;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * End-to-end security tests over the real filter chain: only a valid User Service JWT is accepted,
 * and the requester is bound to the token's {@code sub}. Runs on a random port and drives the
 * endpoint with the JDK HTTP client, so no MockMvc/RestTemplate test slice is needed.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.autoconfigure.exclude="
                        + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                        + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                        + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
                "order.security.jwt.secret=" + OrderSecurityIntegrationTest.SECRET,
                "order.security.jwt.issuer=user-service"
        })
class OrderSecurityIntegrationTest {

    static final String SECRET = "integration-test-secret-0123456789abcdef";
    private static final String ISSUER = "user-service";
    private static final String SUBJECT = "97947588-bb2e-42f2-91ba-9abf8e15a8e7";

    @LocalServerPort
    private int port;

    @MockitoBean
    private OrderService orderService;

    private final HttpClient http = HttpClient.newHttpClient();

    private static String validBody() {
        String deadline = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        return """
                {
                  "title": "Collect printing",
                  "description": "Grab my printout from COM1",
                  "pickupLocationId": "9fd58f13-c8d5-4320-b757-7893d69a4ae0",
                  "dropoffLocationId": "eb46dc78-e25e-4f07-a7a2-26bff615d170",
                  "creditReward": 10,
                  "pickupDeadline": "%s"
                }
                """.formatted(deadline);
    }

    private static String mintToken(String subject, String issuer, Instant expiresAt) throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(subject)
                .issuer(issuer)
                .claim("roles", List.of("USER"))
                .issueTime(Date.from(Instant.now().minusSeconds(5)))
                .expirationTime(Date.from(expiresAt))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        jwt.sign(new MACSigner(SECRET.getBytes(StandardCharsets.UTF_8)));
        return jwt.serialize();
    }

    private HttpResponse<String> post(String bearerToken) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/api/orders"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(validBody()));
        if (bearerToken != null) {
            request.header("Authorization", "Bearer " + bearerToken);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void rejectsRequestWithoutToken() throws Exception {
        HttpResponse<String> response = post(null);
        assertThat(response.statusCode()).isEqualTo(401);
        verify(orderService, never()).createOrder(any());
    }

    @Test
    void acceptsValidTokenAndBindsRequesterToSubject() throws Exception {
        when(orderService.createOrder(any(CreateOrderCommand.class))).thenAnswer(invocation -> {
            CreateOrderCommand command = invocation.getArgument(0);
            return Order.submit(command.requesterId(), command.title(), command.description(),
                    command.pickupLocationId(), command.dropoffLocationId(), command.creditReward(),
                    command.pickupDeadline());
        });

        HttpResponse<String> response = post(mintToken(SUBJECT, ISSUER, Instant.now().plusSeconds(3600)));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body()).contains(SUBJECT);
        assertThat(response.body()).contains("PENDING_CREDIT");
    }

    @Test
    void rejectsExpiredToken() throws Exception {
        HttpResponse<String> response = post(mintToken(SUBJECT, ISSUER, Instant.now().minusSeconds(60)));
        assertThat(response.statusCode()).isEqualTo(401);
        verify(orderService, never()).createOrder(any());
    }

    @Test
    void rejectsTokenFromWrongIssuer() throws Exception {
        HttpResponse<String> response = post(mintToken(SUBJECT, "someone-else", Instant.now().plusSeconds(3600)));
        assertThat(response.statusCode()).isEqualTo(401);
        verify(orderService, never()).createOrder(any());
    }

    @Test
    void rejectsTokenWhoseSubjectIsNotAUuid() throws Exception {
        HttpResponse<String> response = post(mintToken("not-a-uuid", ISSUER, Instant.now().plusSeconds(3600)));
        assertThat(response.statusCode()).isEqualTo(401);
        verify(orderService, never()).createOrder(any());
    }
}
