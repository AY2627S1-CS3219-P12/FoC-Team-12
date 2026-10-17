package com.friendoncampus.order.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.error.ApiExceptionHandler;

/**
 * Body-validation and identity-binding tests for {@link OrderController} using the repo's
 * standalone MockMvc convention. Identity is supplied as an authenticated JWT principal in the
 * SecurityContext (never a header/body); token rejection (401) is covered by
 * {@code OrderSecurityIntegrationTest}, which exercises the real filter chain.
 */
class OrderControllerValidationTest {

    private static final String REQUESTER_ID = "97947588-bb2e-42f2-91ba-9abf8e15a8e7";
    private static final String PICKUP = "9fd58f13-c8d5-4320-b757-7893d69a4ae0";
    private static final String DROPOFF = "eb46dc78-e25e-4f07-a7a2-26bff615d170";

    private OrderService orderService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        orderService = mock(OrderService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new OrderController(orderService))
                .setControllerAdvice(new ApiExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();

        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .subject(REQUESTER_ID)
                .claim("role", "REQUESTER")
                .issuer("friend-on-campus-user-service")
                .audience(List.of("friend-on-campus-api"))
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_REQUESTER"))));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static String futureDeadline() {
        return OffsetDateTime.now(ZoneOffset.UTC).plusDays(1).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static String pastDeadline() {
        return OffsetDateTime.now(ZoneOffset.UTC).minusDays(1).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static String body(String title, String description, String pickup, String dropoff,
            String creditReward, String deadline) {
        return body(title, description, pickup, "COM1 Print Shop", dropoff, "UTown Residence", creditReward, deadline);
    }

    private static String body(String title, String description, String pickup, String pickupName,
            String dropoff, String dropoffName, String creditReward, String deadline) {
        return """
                {
                  "title": %s,
                  "description": %s,
                  "pickupLocationId": %s,
                  "pickupLocationName": %s,
                  "dropoffLocationId": %s,
                  "dropoffLocationName": %s,
                  "creditReward": %s,
                  "pickupDeadline": %s
                }
                """.formatted(json(title), json(description), json(pickup), json(pickupName), json(dropoff),
                json(dropoffName), creditReward, json(deadline));
    }

    private static String json(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    private static String validBody() {
        return body("Collect printing", "Grab my printout from COM1", PICKUP, DROPOFF, "10", futureDeadline());
    }

    @Test
    void createsOrderUsingJwtSubjectAsRequester() throws Exception {
        when(orderService.createOrder(any(CreateOrderCommand.class))).thenAnswer(invocation -> {
            CreateOrderCommand command = invocation.getArgument(0);
            return Order.submit(command.requesterId(), command.title(), command.description(),
                    command.pickupLocationId(), "COM1 Print Shop", command.dropoffLocationId(), "UTown Residence", command.creditReward(),
                    command.pickupDeadline());
        });

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("PENDING_CREDIT"))
                // Requester is bound to the token subject, not anything the client sent.
                .andExpect(jsonPath("$.requesterId").value(REQUESTER_ID));
    }

    @Test
    void rejectsBlankTitle() throws Exception {
        String requestBody = body("   ", "Grab my printout", PICKUP, DROPOFF, "10", futureDeadline());
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.title").exists());
        verify(orderService, never()).createOrder(any());
    }

    @Test
    void rejectsNonPositiveReward() throws Exception {
        String requestBody = body("Collect printing", "Grab my printout", PICKUP, DROPOFF, "0", futureDeadline());
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.creditReward").exists());
    }

    @Test
    void rejectsIdenticalPickupAndDropoff() throws Exception {
        String requestBody = body("Collect printing", "Grab my printout", PICKUP, PICKUP, "10", futureDeadline());
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.locationsDistinct").exists());
    }

    @Test
    void rejectsPastDeadline() throws Exception {
        String requestBody = body("Collect printing", "Grab my printout", PICKUP, DROPOFF, "10", pastDeadline());
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.pickupDeadline").exists());
    }

    @Test
    void rejectsMalformedBody() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ not json"))
                .andExpect(status().isBadRequest());
        verify(orderService, never()).createOrder(any());
    }

    @Test
    void storesTheTrimmedLocationNamesTheClientSent() throws Exception {
        when(orderService.createOrder(any(CreateOrderCommand.class))).thenAnswer(invocation -> {
            CreateOrderCommand command = invocation.getArgument(0);
            return Order.submit(command.requesterId(), command.title(), command.description(),
                    command.pickupLocationId(), command.pickupLocationName(), command.dropoffLocationId(),
                    command.dropoffLocationName(), command.creditReward(), command.pickupDeadline());
        });

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Collect printing", "Grab my printout", PICKUP, "  COM1 Print Shop  ",
                                DROPOFF, "UTown Residence", "10", futureDeadline())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.pickupLocationName").value("COM1 Print Shop"))
                .andExpect(jsonPath("$.dropoffLocationName").value("UTown Residence"));
    }

    @Test
    void rejectsMissingBlankOrTooLongLocationNames() throws Exception {
        String tooLong = "x".repeat(161);

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Collect printing", "Grab my printout", PICKUP, null, DROPOFF, "   ", "10",
                                futureDeadline())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.pickupLocationName").exists())
                .andExpect(jsonPath("$.errors.dropoffLocationName").exists());
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Collect printing", "Grab my printout", PICKUP, tooLong, DROPOFF,
                                "UTown Residence", "10", futureDeadline())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.pickupLocationName").exists());
        verify(orderService, never()).createOrder(any());
    }
}
