package com.friendoncampus.notification.domain;

/**
 * What a notification tells its recipient; picks the message template and icon. Stored as text
 * without a database CHECK, so adding a value needs no migration. See DESIGN.md "Notification types".
 */
public enum NotificationType {
    /** {@code CreditAccountAllocated}: the new account received its starting credits. */
    CREDITS_WELCOME,
    /** {@code CreditSettled}: the courier was paid the reward for a completed errand. */
    CREDITS_RECEIVED,
    /** {@code CourierCompensated}: the courier was compensated for an errand cancelled after acceptance. */
    CREDITS_COMPENSATED
}
