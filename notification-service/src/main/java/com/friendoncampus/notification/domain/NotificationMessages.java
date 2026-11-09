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
            case ORDER_OPENED -> "Your errand " + title(params) + " is live. Couriers can now accept it.";
            case ORDER_RESERVATION_FAILED -> "Your errand " + title(params) + " couldn't be posted: "
                    + reservationFailure(params) + ".";
            case ORDER_ACCEPTED -> "A courier accepted your errand " + title(params) + ".";
            case ORDER_COURIER_WITHDREW -> "Your courier withdrew from " + title(params)
                    + ". It's open for other couriers again.";
            case ORDER_EXPIRED -> "Your errand " + title(params)
                    + " expired before pickup. Your reserved credits are being returned.";
            case ORDER_CANCELLED -> "The requester cancelled " + title(params) + ".";
            case ORDER_PICKED_UP -> "Your courier picked up " + title(params) + ".";
            case ORDER_DELIVERED -> "Your courier delivered " + title(params) + ". Please confirm you received it.";
            case ORDER_COMPLETED -> "The requester confirmed they received " + title(params) + ".";
        };
    }

    private static String title(JsonNode params) {
        return "\"" + params.path("title").asString() + "\"";
    }

    /** Only approved Credit codes are shown in words; anything else gets the generic reason. */
    private static String reservationFailure(JsonNode params) {
        return switch (params.path("reason").asString()) {
            case "INSUFFICIENT_CREDITS" -> "you don't have enough credits";
            case "CREDIT_ACCOUNT_NOT_FOUND" -> "your credit account isn't set up yet";
            case "CREDIT_RESERVATION_TIMEOUT" -> "Credit didn't confirm your credits in time";
            default -> "the credits couldn't be reserved";
        };
    }

    private static String credits(JsonNode params) {
        int amount = params.path("amount").asInt();
        return amount == 1 ? "1 credit" : amount + " credits";
    }
}
