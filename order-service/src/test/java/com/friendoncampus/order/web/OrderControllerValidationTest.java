package com.friendoncampus.order.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.service.CreateOrderCommand;
import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.error.ApiExceptionHandler;

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
                .build();
    }

    private static String futureDeadline() {
        return OffsetDateTime.now(ZoneOffset.UTC).plusDays(1).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static String pastDeadline() {
        return OffsetDateTime.now(ZoneOffset.UTC).minusDays(1).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static String body(String title, String description, String pickup, String dropoff,
            String creditReward, String deadline) {
        return """
                {
                  "title": %s,
                  "description": %s,
                  "pickupLocationId": %s,
                  "dropoffLocationId": %s,
                  "creditReward": %s,
                  "pickupDeadline": %s
                }
                """.formatted(
                json(title), json(description), json(pickup), json(dropoff), creditReward, json(deadline));
    }

    private static String json(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    private static String validBody() {
        return body("Collect printing", "Grab my printout from COM1", PICKUP, DROPOFF, "10", futureDeadline());
    }

    @Test
    void createsOrderForValidRequest() throws Exception {
        when(orderService.createOrder(any(CreateOrderCommand.class))).thenAnswer(invocation -> {
            CreateOrderCommand command = invocation.getArgument(0);
            return Order.submit(command.requesterId(), command.title(), command.description(),
                    command.pickupLocationId(), command.dropoffLocationId(), command.creditReward(),
                    command.pickupDeadline());
        });

        mockMvc.perform(post("/api/orders")
                        .header("X-User-Id", REQUESTER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("PENDING_CREDIT"))
                .andExpect(jsonPath("$.requesterId").value(REQUESTER_ID));
    }

    @Test
    void rejectsMissingRequesterHeader() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Missing request header"));
        verify(orderService, never()).createOrder(any());
    }

    @Test
    void rejectsMalformedRequesterHeader() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .header("X-User-Id", "not-a-uuid")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validBody()))
                .andExpect(status().isBadRequest());
        verify(orderService, never()).createOrder(any());
    }

    @Test
    void rejectsBlankTitle() throws Exception {
        String requestBody = body("   ", "Grab my printout", PICKUP, DROPOFF, "10", futureDeadline());
        mockMvc.perform(post("/api/orders")
                        .header("X-User-Id", REQUESTER_ID)
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
                        .header("X-User-Id", REQUESTER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.creditReward").exists());
    }

    @Test
    void rejectsIdenticalPickupAndDropoff() throws Exception {
        String requestBody = body("Collect printing", "Grab my printout", PICKUP, PICKUP, "10", futureDeadline());
        mockMvc.perform(post("/api/orders")
                        .header("X-User-Id", REQUESTER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.locationsDistinct").exists());
    }

    @Test
    void rejectsPastDeadline() throws Exception {
        String requestBody = body("Collect printing", "Grab my printout", PICKUP, DROPOFF, "10", pastDeadline());
        mockMvc.perform(post("/api/orders")
                        .header("X-User-Id", REQUESTER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.pickupDeadline").exists());
    }

    @Test
    void rejectsMalformedBody() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .header("X-User-Id", REQUESTER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ not json"))
                .andExpect(status().isBadRequest());
        verify(orderService, never()).createOrder(any());
    }
}
