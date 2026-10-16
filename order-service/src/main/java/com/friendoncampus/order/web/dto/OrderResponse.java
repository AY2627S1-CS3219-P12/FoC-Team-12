package com.friendoncampus.order.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.domain.TerminalReason;

public record OrderResponse(
        UUID id,
        UUID requesterId,
        UUID courierId,
        String title,
        String description,
        UUID pickupLocationId,
        UUID dropoffLocationId,
        int creditReward,
        OffsetDateTime pickupDeadline,
        OrderState state,
        TerminalReason terminalReason,
        long version,
        OffsetDateTime createdAt,
        OffsetDateTime stateChangedAt) {

    public static OrderResponse from(Order order) {
        return new OrderResponse(
                order.getId(),
                order.getRequesterId(),
                order.getCourierId(),
                order.getTitle(),
                order.getDescription(),
                order.getPickupLocationId(),
                order.getDropoffLocationId(),
                order.getCreditReward(),
                order.getPickupDeadline(),
                order.getState(),
                order.getTerminalReason(),
                order.getVersion(),
                order.getCreatedAt(),
                order.getStateChangedAt());
    }
}
