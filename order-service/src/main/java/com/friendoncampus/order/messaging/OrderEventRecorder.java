package com.friendoncampus.order.messaging;

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

import tools.jackson.databind.json.JsonMapper;

/**
 * Records one transition as a history row plus an {@code order.events} outbox row, using the
 * envelope from DESIGN.md. Callers must already be inside the transaction that changed the order,
 * and must have flushed it so {@link Order#getVersion()} is the post-change version.
 */
@Component
public class OrderEventRecorder {

    public static final String ORDER_EVENTS_TOPIC = "order.events";
    private static final int EVENT_VERSION = 1;
    private static final String PRODUCER = "order-service";

    private final OrderTransitionRepository transitionRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public OrderEventRecorder(
            OrderTransitionRepository transitionRepository,
            OutboxEventRepository outboxEventRepository) {
        this.transitionRepository = transitionRepository;
        this.outboxEventRepository = outboxEventRepository;
    }

    public void record(Order order, OrderTransition transition) {
        long version = order.getVersion();
        transitionRepository.save(OrderTransitionRecord.of(order.getId(), version, transition));

        UUID eventId = UUID.randomUUID();
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("eventId", eventId);
        envelope.put("eventType", transition.eventType());
        envelope.put("eventVersion", EVENT_VERSION);
        envelope.put("aggregateType", "Order");
        envelope.put("aggregateId", order.getId());
        envelope.put("aggregateVersion", version);
        envelope.put("occurredAt", transition.occurredAt().toString());
        envelope.put("producer", PRODUCER);
        envelope.put("correlationId", order.getId());
        envelope.put("causationId", null);
        envelope.put("actor", actor(transition));
        envelope.put("data", data(order, transition, version));

        outboxEventRepository.save(new OutboxEvent(eventId, order.getId(), version, transition.eventType(),
                ORDER_EVENTS_TOPIC, jsonMapper.writeValueAsString(envelope), transition.occurredAt()));
    }

    private static Map<String, Object> actor(OrderTransition transition) {
        Map<String, Object> actor = new LinkedHashMap<>();
        actor.put("role", transition.actorRole().name());
        actor.put("userId", transition.actorRole() == ActorRole.SYSTEM ? null : transition.actorId());
        return actor;
    }

    private static Map<String, Object> data(Order order, OrderTransition transition, long version) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderId", order.getId());
        data.put("requesterId", order.getRequesterId());
        data.put("fromState", transition.fromState() == null ? null : transition.fromState().name());
        data.put("toState", transition.toState().name());
        data.put("creditReward", order.getCreditReward());
        data.put("pickupDeadline", order.getPickupDeadline().toString());
        data.put("creditEffect", transition.creditEffect().name());
        if (transition.creditEffect() != CreditEffect.NONE) {
            // Lets Credit de-duplicate replays: one operation per order transition.
            data.put("operationId", order.getId() + ":" + transition.action().name() + ":" + version);
            data.put("creditReservationId", order.getCreditReservationId());
        }
        if (transition.courierId() != null) {
            data.put("courierId", transition.courierId());
        }
        if (transition.reason() != null) {
            data.put("reason", transition.reason().name());
        }
        if ("OrderCancelled".equals(transition.eventType())) {
            data.put("compensationRequired", transition.creditEffect() == CreditEffect.COMPENSATE);
        }
        return data;
    }
}
