package com.friendoncampus.notification.domain;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Builds the text a recipient reads from a notification's type and stored template values. Text is
 * built when read, not stored, so wording can change without rewriting past notifications.
 */
public final class NotificationMessages {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private NotificationMessages() {
    }

    public static String messageFor(Notification notification) {
        JsonNode params = JSON.readTree(notification.getParams());
        return switch (notification.getType()) {
            case CREDITS_WELCOME -> "Welcome! You received " + credits(params) + " to get started.";
            case CREDITS_RECEIVED -> "You received " + credits(params) + " for completing an errand.";
            case CREDITS_COMPENSATED -> "You received " + credits(params) + " as compensation for a cancelled errand.";
        };
    }

    private static String credits(JsonNode params) {
        int amount = params.path("amount").asInt();
        return amount == 1 ? "1 credit" : amount + " credits";
    }
}
