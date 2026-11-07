package com.friendoncampus.order.messaging;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.friendoncampus.order.domain.ActorRole;
import com.friendoncampus.order.domain.CreditEffect;
import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderTransition;
import com.friendoncampus.order.domain.OrderTransitionRecord;
import com.friendoncampus.order.repository.OrderTransitionRepository;
import com.friendoncampus.order.repository.OutboxEventRepository;
import com.friendoncampus.order.repository.LifecycleOutboxEventRepository;

import tools.jackson.databind.json.JsonMapper;

/**
 * Records every transition in the order's history, and writes an {@code order.events} outbox row
 * for the credit-changing ones, using the envelope and payloads of the shared event communication
 * blueprint ({@code docs/integration/event-communication-blueprint.md}, version 1). Only the five blueprint Order events are published:
 * {@code OrderSubmitted}, {@code OrderRewardChangeRequested}, {@code OrderCancelled},
 * {@code OrderExpired} and {@code OrderCompleted}. Other transitions stay in the history only.
 *
 * <p>Callers must already be inside the transaction that changed the order, and must have flushed
 * it so {@link Order#getVersion()} is the post-change version.
 */
@Component
public class OrderEventRecorder {

    public static final String ORDER_EVENTS_TOPIC = "order.events";
    public static final String ORDER_LIFECYCLE_TOPIC = "order.lifecycle.events";
    static final int EVENT_VERSION = 1;
    static final String PRODUCER = "order-service";

    private final OrderTransitionRepository transitionRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final LifecycleOutboxEventRepository lifecycleOutboxEventRepository;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public OrderEventRecorder(
            OrderTransitionRepository transitionRepository,
            OutboxEventRepository outboxEventRepository,
            LifecycleOutboxEventRepository lifecycleOutboxEventRepository) {
        this.transitionRepository = transitionRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.lifecycleOutboxEventRepository = lifecycleOutboxEventRepository;
    }

    public void record(Order order, OrderTransition transition) {
        long version = order.getVersion();
        transitionRepository.save(OrderTransitionRecord.of(order.getId(), version, transition));
        if (transition.creditEffect() == CreditEffect.NONE) {
            recordLifecycle(order, transition, version);
            return;
        }

        UUID eventId = UUID.randomUUID();
        // Generated once and stored with the event; a publish retry reuses this exact payload.
        UUID operationId = UUID.randomUUID();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", transition.eventType());
        envelope.put("eventVersion", EVENT_VERSION);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", order.getId());
        envelope.put("aggregateVersion", version);
        envelope.put("occurredAt", utc(transition.occurredAt()));
        envelope.put("producer", PRODUCER);
        envelope.put("correlationId", order.getCorrelationId());
        // OrderSubmitted initiates the workflow; later Order events are triggered by a user action
        // or the expiry job rather than by another event, so none has a causing event.
        envelope.put("causationId", null);
        envelope.put("actor", actor(transition));
        envelope.put("data", data(order, transition, operationId));

        outboxEventRepository.save(new OutboxEvent(eventId, order.getId(), version, transition.eventType(),
                ORDER_EVENTS_TOPIC, operationId, jsonMapper.writeValueAsString(envelope),
                transition.occurredAt()));
        recordLifecycle(order, transition, version);
    }

    private void recordLifecycle(Order order, OrderTransition transition, long version) {
        long sourceSequence = lifecycleOutboxEventRepository.nextSourceSequence(order.getId());
        UUID eventId = UUID.randomUUID();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", "OrderTransitioned");
        envelope.put("eventVersion", EVENT_VERSION);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", order.getId());
        envelope.put("aggregateVersion", version);
        envelope.put("occurredAt", utc(transition.occurredAt()));
        envelope.put("producer", PRODUCER);
        envelope.put("correlationId", order.getCorrelationId());
        envelope.put("causationId", null);
        envelope.put("actor", actor(transition));
        Map<String, Object> lifecycle = new LinkedHashMap<>();
        lifecycle.put("orderId", order.getId());
        lifecycle.put("requesterId", order.getRequesterId());
        lifecycle.put("courierId", order.getCourierId());
        lifecycle.put("previousCourierId", previousCourier(transition));
        lifecycle.put("action", transition.action().name());
        lifecycle.put("fromState", transition.fromState() == null ? null : transition.fromState().name());
        lifecycle.put("toState", transition.toState().name());
        lifecycle.put("sourceSequence", sourceSequence);
        lifecycle.put("reasonCode", transition.reason() == null ? null : transition.reason().name());
        lifecycle.put("snapshot", lifecycleSnapshot(order));
        envelope.put("data", lifecycle);
        lifecycleOutboxEventRepository.save(new LifecycleOutboxEvent(eventId, order.getId(), version,
                sourceSequence, "OrderTransitioned", jsonMapper.writeValueAsString(envelope), transition.occurredAt()));
    }

    private static UUID previousCourier(OrderTransition transition) {
        return switch (transition.action()) {
            case WITHDRAW, CANCEL -> transition.courierId();
            default -> null;
        };
    }

    private static Map<String, Object> lifecycleSnapshot(Order order) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("orderId", order.getId());
        snapshot.put("requesterId", order.getRequesterId());
        snapshot.put("courierId", order.getCourierId());
        snapshot.put("status", order.getState().name());
        snapshot.put("title", order.getTitle());
        snapshot.put("description", order.getDescription());
        snapshot.put("creditReward", order.getCreditReward());
        snapshot.put("pickupDeadline", utc(order.getPickupDeadline()));
        snapshot.put("pickupLocationId", order.getPickupLocationId());
        snapshot.put("dropoffLocationId", order.getDropoffLocationId());
        snapshot.put("pickupLocationName", order.getPickupLocationName());
        snapshot.put("dropoffLocationName", order.getDropoffLocationName());
        return snapshot;
    }

    private static Map<String, Object> actor(OrderTransition transition) {
        Map<String, Object> actor = new LinkedHashMap<>();
        if (transition.actorRole() == ActorRole.SYSTEM) {
            actor.put("type", "SYSTEM");
            return actor;
        }
        actor.put("type", "USER");
        actor.put("userId", transition.actorId());
        actor.put("role", transition.actorRole().name());
        return actor;
    }

    private static Map<String, Object> data(Order order, OrderTransition transition, UUID operationId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("operationId", operationId);
        data.put("orderId", order.getId());
        switch (transition.eventType()) {
            case "OrderSubmitted" -> {
                data.put("requesterId", order.getRequesterId());
                data.put("creditReward", order.getCreditReward());
            }
            case "OrderRewardChangeRequested" -> data.put("newCreditReward", order.getPendingCreditReward());
            case "OrderCancelled" -> {
                boolean compensationRequired = transition.creditEffect() == CreditEffect.COMPENSATE;
                data.put("courierId", compensationRequired ? transition.courierId() : null);
                data.put("compensationRequired", compensationRequired);
                data.put("reason", transition.reason().name());
                data.put("cancelledAt", utc(transition.occurredAt()));
            }
            case "OrderExpired" -> {
                data.put("reason", transition.reason().name());
                data.put("expiredAt", utc(transition.occurredAt()));
            }
            case "OrderCompleted" -> {
                data.put("courierId", transition.courierId());
                data.put("completedAt", utc(transition.occurredAt()));
            }
            default -> throw new IllegalStateException(
                    "No blueprint payload for credit-changing event " + transition.eventType());
        }
        return data;
    }

    /** UTC ISO-8601 with a {@code Z} offset, at the microsecond precision PostgreSQL stores. */
    static String utc(OffsetDateTime timestamp) {
        return timestamp.withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS).toString();
    }
}
