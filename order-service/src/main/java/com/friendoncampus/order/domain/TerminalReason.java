package com.friendoncampus.order.domain;

/** Why an order reached a terminal state; stored in {@code orders.terminal_reason}. */
public enum TerminalReason {
    REQUESTER_CANCELLED_OPEN,
    REQUESTER_CANCELLED_ACCEPTED,
    PICKUP_DEADLINE_PASSED,
    COURIER_WITHDREW_AFTER_DEADLINE,
    /** RESERVATION_FAILED: Credit's {@code INSUFFICIENT_CREDITS}. */
    INSUFFICIENT_CREDITS,
    /** RESERVATION_FAILED: Credit's {@code CREDIT_ACCOUNT_NOT_FOUND}. */
    CREDIT_ACCOUNT_NOT_FOUND,
    /** RESERVATION_FAILED for any other or missing Credit reason code. */
    CREDIT_RESERVATION_REJECTED;

    /** Maps a {@code CreditReservationRejected} reason code to the terminal reason the client shows. */
    public static TerminalReason forReservationRejection(String reasonCode) {
        if ("INSUFFICIENT_CREDITS".equals(reasonCode)) return INSUFFICIENT_CREDITS;
        if ("CREDIT_ACCOUNT_NOT_FOUND".equals(reasonCode)) return CREDIT_ACCOUNT_NOT_FOUND;
        return CREDIT_RESERVATION_REJECTED;
    }
}
