package com.friendoncampus.order.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OrderSpecifications;

/** Read-only list queries: the open-order pool (F4) and the caller's order history (F9). */
@Service
public class OrderQueryService {

    /** Finished orders shown in the requester's history. RESERVATION_FAILED is left out (DESIGN.md gap). */
    static final Set<OrderState> REQUESTER_HISTORY_STATES =
            EnumSet.of(OrderState.COMPLETED, OrderState.CANCELLED, OrderState.EXPIRED);

    /** Newest first, with {@code id} as a stable tiebreaker. */
    private static final Sort HISTORY_SORT = Sort.by(Sort.Order.desc("stateChangedAt"), Sort.Order.asc("id"));

    private final OrderRepository orderRepository;
    private final Clock clock;

    public OrderQueryService(OrderRepository orderRepository, Clock clock) {
        this.orderRepository = orderRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<Order> findOpenPool(UUID callerId, OrderPoolQuery query) {
        Specification<Order> specification = OrderSpecifications.availableTo(callerId, now());
        if (query.minReward() != null) {
            specification = specification.and(OrderSpecifications.rewardAtLeast(query.minReward()));
        }
        if (query.maxReward() != null) {
            specification = specification.and(OrderSpecifications.rewardAtMost(query.maxReward()));
        }
        if (query.pickupLocationId() != null) {
            specification = specification.and(OrderSpecifications.pickupAt(query.pickupLocationId()));
        }
        if (query.dropoffLocationId() != null) {
            specification = specification.and(OrderSpecifications.dropoffAt(query.dropoffLocationId()));
        }
        return orderRepository.findAll(specification, pageRequest(query.paging(), query.sort().sort()));
    }

    /** The caller's own finished orders: COMPLETED, CANCELLED or EXPIRED (F9.1). */
    @Transactional(readOnly = true)
    public Page<Order> findRequestedHistory(UUID callerId, OrderPaging paging) {
        Specification<Order> specification = OrderSpecifications.requestedBy(callerId)
                .and(OrderSpecifications.inStates(REQUESTER_HISTORY_STATES));
        return orderRepository.findAll(specification, pageRequest(paging, HISTORY_SORT));
    }

    /** COMPLETED orders the caller delivered as courier (F9.2). */
    @Transactional(readOnly = true)
    public Page<Order> findDeliveredHistory(UUID callerId, OrderPaging paging) {
        Specification<Order> specification = OrderSpecifications.deliveredBy(callerId)
                .and(OrderSpecifications.inStates(EnumSet.of(OrderState.COMPLETED)));
        return orderRepository.findAll(specification, pageRequest(paging, HISTORY_SORT));
    }

    private static PageRequest pageRequest(OrderPaging paging, Sort sort) {
        return PageRequest.of(paging.page(), paging.size(), sort);
    }

    /** The current time at stored precision, matching how {@link OrderService} checks deadlines. */
    private OffsetDateTime now() {
        return Order.toStoredPrecision(OffsetDateTime.now(clock));
    }
}
