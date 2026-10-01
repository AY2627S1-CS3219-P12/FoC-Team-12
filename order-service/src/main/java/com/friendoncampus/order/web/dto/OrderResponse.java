package com.friendoncampus.order.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "A created order")
public record OrderResponse(
        UUID id,
        UUID requesterId,
        String title,
        String description,
        UUID pickupLocationId,
        UUID dropoffLocationId,
        int creditReward,
        OffsetDateTime pickupDeadline,
        OrderState state,
        long version,
        OffsetDateTime createdAt) {

    public static OrderResponse from(Order order) {
        return new OrderResponse(
                order.getId(),
                order.getRequesterId(),
                order.getTitle(),
                order.getDescription(),
                order.getPickupLocationId(),
                order.getDropoffLocationId(),
                order.getCreditReward(),
                order.getPickupDeadline(),
                order.getState(),
                order.getVersion(),
                order.getCreatedAt());
    }
}
