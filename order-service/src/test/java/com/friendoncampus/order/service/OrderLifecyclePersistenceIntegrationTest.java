package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransitionException;
import com.friendoncampus.order.messaging.OutboxEvent;
import com.friendoncampus.order.repository.OutboxEventRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Runs against a real PostgreSQL (Testcontainers, Flyway V1 + V2) to prove that each transition
 * stores the order change, its history row and its outbox event together, or nothing at all.
 * Requires Docker.
 */
@SpringBootTest
@Testcontainers
class OrderLifecyclePersistenceIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");
    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");

    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(NOW, ZoneOffset.UTC);
        }
    }

    // The decoder would otherwise fetch User Service keys; no tokens are used here.
    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Autowired
    private OrderService orderService;

    @Autowired
    private OutboxEventRepository outboxEventRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private final JsonMapper json = JsonMapper.builder().build();

    private UUID createOrder() {
        // The deadline is relative to real time so the database CHECK (deadline > created_at) holds.
        OffsetDateTime deadline = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1);
        return orderService.createOrder(new CreateOrderCommand(REQUESTER, "Collect printing",
                "Grab my printout", UUID.randomUUID(), UUID.randomUUID(), 10, deadline)).getId();
    }

    private int count(String table, UUID orderId) {
        String column = table.equals("outbox_events") ? "aggregate_id" : "order_id";
        return jdbc.queryForObject("select count(*) from " + table + " where " + column + " = ?",
                Integer.class, orderId);
    }

    @Test
    void creatingAnOrderStoresOneHistoryRowAndOneOrderSubmittedEvent() {
        UUID orderId = createOrder();

        assertThat(count("order_transitions", orderId)).isEqualTo(1);
        List<OutboxEvent> events = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId);
        assertThat(events).hasSize(1);
        OutboxEvent event = events.get(0);
        assertThat(event.getEventType()).isEqualTo("OrderSubmitted");
        assertThat(event.getTopic()).isEqualTo("order.events");
        assertThat(event.getPublishedAt()).isNull();

        JsonNode envelope = json.readTree(event.getPayload());
        assertThat(envelope.get("eventId").asString()).isEqualTo(event.getId().toString());
        assertThat(envelope.get("aggregateId").asString()).isEqualTo(orderId.toString());
        assertThat(envelope.get("aggregateVersion").asLong()).isEqualTo(event.getAggregateVersion());
        assertThat(envelope.get("producer").asString()).isEqualTo("order-service");
        assertThat(envelope.get("actor").get("userId").asString()).isEqualTo(REQUESTER.toString());
        JsonNode data = envelope.get("data");
        assertThat(data.get("toState").asString()).isEqualTo("PENDING_CREDIT");
        assertThat(data.get("creditEffect").asString()).isEqualTo("RESERVE");
        assertThat(data.get("creditReward").asInt()).isEqualTo(10);
        assertThat(data.get("operationId").asString()).startsWith(orderId + ":SUBMIT:");
    }

    @Test
    void reservationThenCancelRecordsEachTransitionWithIncreasingVersions() {
        UUID orderId = createOrder();
        orderService.confirmReservation(orderId, UUID.randomUUID());

        assertThat(orderService.cancel(orderId, REQUESTER).getState()).isEqualTo(OrderState.CANCELLED);

        List<OutboxEvent> events = outboxEventRepository.findByAggregateIdOrderByAggregateVersionAsc(orderId);
        assertThat(events).extracting(OutboxEvent::getEventType)
                .containsExactly("OrderSubmitted", "OrderOpened", "OrderCancelled");
        assertThat(events).extracting(OutboxEvent::getAggregateVersion).doesNotHaveDuplicates().isSorted();
        JsonNode cancelled = json.readTree(events.get(2).getPayload()).get("data");
        assertThat(cancelled.get("creditEffect").asString()).isEqualTo("RELEASE");
        assertThat(cancelled.get("compensationRequired").asBoolean()).isFalse();
        assertThat(orderService.getHistory(orderId, REQUESTER)).hasSize(3);
    }

    @Test
    void repeatedRequestsAndRepliesRecordNothingNew() {
        UUID orderId = createOrder();
        UUID reservation = UUID.randomUUID();
        orderService.confirmReservation(orderId, reservation);
        orderService.confirmReservation(orderId, reservation);
        orderService.cancel(orderId, REQUESTER);
        orderService.cancel(orderId, REQUESTER);

        assertThat(count("order_transitions", orderId)).isEqualTo(3);
        assertThat(count("outbox_events", orderId)).isEqualTo(3);
    }

    @Test
    void aRejectedReservationEndsTheOrderAndARepeatIsIgnored() {
        UUID orderId = createOrder();

        orderService.rejectReservation(orderId);
        orderService.rejectReservation(orderId);

        assertThat(orderService.getOrder(orderId, REQUESTER).getState()).isEqualTo(OrderState.RESERVATION_FAILED);
        assertThat(count("outbox_events", orderId)).isEqualTo(2);
    }

    @Test
    void aRejectedActionLeavesNoHistoryOrEventBehind() {
        UUID orderId = createOrder();

        // Still PENDING_CREDIT, so cancel is not allowed yet.
        assertThatThrownBy(() -> orderService.cancel(orderId, REQUESTER))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));

        assertThat(orderService.getOrder(orderId, REQUESTER).getState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(count("order_transitions", orderId)).isEqualTo(1);
        assertThat(count("outbox_events", orderId)).isEqualTo(1);
    }
}
