package com.friendoncampus.order.domain;

/** Why an order reached a terminal state; stored in {@code orders.terminal_reason}. */
public enum TerminalReason {
    REQUESTER_CANCELLED_OPEN,
    REQUESTER_CANCELLED_ACCEPTED,
    PICKUP_DEADLINE_PASSED,
    COURIER_WITHDREW_AFTER_DEADLINE,
    CREDIT_RESERVATION_REJECTED
}
