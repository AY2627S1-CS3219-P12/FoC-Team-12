package com.friendoncampus.order.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.domain.OrderAction;
import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.OrderTransition;
import com.friendoncampus.order.domain.OrderTransitionRecord;
import com.friendoncampus.order.messaging.OrderEventRecorder;
import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OrderTransitionRepository;

/**
 * Order use cases. Every state change runs in one transaction that locks the order row, applies
 * the domain transition, and records its history row and outbox event, so either all of them are
 * stored or none are.
 */
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderTransitionRepository transitionRepository;
    private final OrderEventRecorder eventRecorder;
    private final Clock clock;

    public OrderService(
            OrderRepository orderRepository,
            OrderTransitionRepository transitionRepository,
            OrderEventRecorder eventRecorder,
            Clock clock) {
        this.orderRepository = orderRepository;
        this.transitionRepository = transitionRepository;
        this.eventRecorder = eventRecorder;
        this.clock = clock;
    }

    /** Persists a new order in PENDING_CREDIT and records {@code OrderSubmitted} (Credit reserves). */
    @Transactional
    public Order createOrder(CreateOrderCommand command) {
        Order order = orderRepository.saveAndFlush(Order.submit(
                command.requesterId(),
                command.title(),
                command.description(),
                command.pickupLocationId(),
                command.dropoffLocationId(),
                command.creditReward(),
                command.pickupDeadline()));
        eventRecorder.record(order, order.submitted(now()));
        return order;
    }

    /** Returns the order if the caller may see it; otherwise reports it as not found. */
    @Transactional(readOnly = true)
    public Order getOrder(UUID orderId, UUID callerId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!order.isVisibleTo(callerId)) {
            throw new OrderNotFoundException(orderId);
        }
        return order;
    }

    /** The order's transitions in the order they happened; participants only. */
    @Transactional(readOnly = true)
    public List<OrderTransitionRecord> getHistory(UUID orderId, UUID callerId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!order.isParticipant(callerId)) {
            throw new OrderNotFoundException(orderId);
        }
        return transitionRepository.findByOrderIdOrderByOccurredAtAscOrderVersionAsc(orderId);
    }

    /**
     * The requester cancels. Repeating a cancel the same requester already made returns the
     * cancelled order without recording anything again.
     */
    @Transactional
    public Order cancel(UUID orderId, UUID callerId) {
        Order order = lockVisible(orderId, callerId);
        if (order.getState() == OrderState.CANCELLED && order.getRequesterId().equals(callerId)) {
            return order;
        }
        return apply(order, order.cancel(callerId, now()));
    }

    /**
     * Credit confirmed the reservation (called by the Credit reply consumer in a later iteration).
     * A repeated confirmation for an order that already left PENDING_CREDIT is ignored.
     */
    @Transactional
    public Order confirmReservation(UUID orderId, UUID reservationId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (order.getState() != OrderState.PENDING_CREDIT && alreadyHandled(orderId, OrderAction.OPEN)) {
            return order;
        }
        return apply(order, order.open(reservationId, now()));
    }

    /** Credit rejected the reservation. A repeated rejection is ignored. */
    @Transactional
    public Order rejectReservation(UUID orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (order.getState() == OrderState.RESERVATION_FAILED) {
            return order;
        }
        return apply(order, order.failReservation(now()));
    }

    private Order lockVisible(UUID orderId, UUID callerId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));
        if (!order.isVisibleTo(callerId)) {
            throw new OrderNotFoundException(orderId);
        }
        return order;
    }

    private boolean alreadyHandled(UUID orderId, OrderAction action) {
        return transitionRepository.findByOrderIdOrderByOccurredAtAscOrderVersionAsc(orderId).stream()
                .anyMatch(record -> record.getAction() == action);
    }

    private Order apply(Order order, OrderTransition transition) {
        // Flush first so the recorded aggregateVersion is the order's post-change version.
        Order saved = orderRepository.saveAndFlush(order);
        eventRecorder.record(saved, transition);
        return saved;
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }
}
