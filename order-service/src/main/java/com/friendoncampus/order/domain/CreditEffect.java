package com.friendoncampus.order.domain;

/**
 * The credit consequence of a transition, carried in its event for Credit Service to apply.
 * Order decides the lifecycle; Credit owns the ledger arithmetic (for example the 20% rounded-up
 * courier compensation).
 */
public enum CreditEffect {
    NONE,
    RESERVE,
    RELEASE,
    COMPENSATE
}
