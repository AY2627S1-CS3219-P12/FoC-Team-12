package com.friendoncampus.notification.web.dto;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;

import io.swagger.v3.oas.annotations.media.Schema;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** One notification as the recipient sees it. */
@Schema(description = "A notification for the signed-in user")
public record NotificationResponse(
        @Schema(description = "Notification ID", format = "uuid")
        UUID id,
        @Schema(description = "What happened; picks the message and icon", example = "CREDITS_RECEIVED")
        NotificationType type,
        @Schema(description = "Errand to link to, or null for account-level notifications", format = "uuid",
                nullable = true)
        UUID orderId,
        @Schema(description = "Template values for the message, for example {\"amount\": 3}")
        Map<String, Object> params,
        @Schema(description = "When the fact happened (UTC)")
        OffsetDateTime occurredAt,
        @Schema(description = "Whether the user has marked it read")
        boolean read) {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<Map<String, Object>> PARAMS = new TypeReference<>() {
    };

    public NotificationResponse {
        // Not Map.copyOf: a template value may be null, for example an absent reason.
        params = Collections.unmodifiableMap(new LinkedHashMap<>(params));
    }

    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType(),
                notification.getOrderId(),
                JSON.readValue(notification.getParams(), PARAMS),
                notification.getOccurredAt(),
                notification.getReadAt() != null);
    }
}
