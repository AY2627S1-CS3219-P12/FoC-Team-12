package com.friendoncampus.order.repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;

/** Query building blocks for the open-order pool and the "my orders" history lists. */
public final class OrderSpecifications {

    private OrderSpecifications() {
    }

    /**
     * Orders a courier can take right now: OPEN, pickup deadline still ahead (an overdue order is
     * not offered even before the expiry job reaches it), no reward change waiting on Credit, and
     * not requested by the caller.
     */
    public static Specification<Order> availableTo(UUID callerId, OffsetDateTime now) {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("state"), OrderState.OPEN),
                cb.greaterThan(root.<OffsetDateTime>get("pickupDeadline"), now),
                cb.isNull(root.get("pendingCreditReward")),
                cb.notEqual(root.get("requesterId"), callerId));
    }

    public static Specification<Order> rewardAtLeast(int minReward) {
        return (root, query, cb) -> cb.greaterThanOrEqualTo(root.<Integer>get("creditReward"), minReward);
    }

    public static Specification<Order> rewardAtMost(int maxReward) {
        return (root, query, cb) -> cb.lessThanOrEqualTo(root.<Integer>get("creditReward"), maxReward);
    }

    public static Specification<Order> pickupAt(UUID locationId) {
        return (root, query, cb) -> cb.equal(root.get("pickupLocationId"), locationId);
    }

    public static Specification<Order> dropoffAt(UUID locationId) {
        return (root, query, cb) -> cb.equal(root.get("dropoffLocationId"), locationId);
    }

    public static Specification<Order> requestedBy(UUID requesterId) {
        return (root, query, cb) -> cb.equal(root.get("requesterId"), requesterId);
    }

    public static Specification<Order> deliveredBy(UUID courierId) {
        return (root, query, cb) -> cb.equal(root.get("courierId"), courierId);
    }

    public static Specification<Order> inStates(Collection<OrderState> states) {
        return (root, query, cb) -> root.get("state").in(states);
    }
}
