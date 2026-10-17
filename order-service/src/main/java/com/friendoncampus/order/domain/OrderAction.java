package com.friendoncampus.order.domain;

/** Lifecycle actions recorded in the transition history. */
public enum OrderAction {
    SUBMIT,
    OPEN,
    FAIL_RESERVATION,
    CANCEL,
    EXPIRE,
    ACCEPT,
    WITHDRAW
}
