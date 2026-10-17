package com.friendoncampus.order.service;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Expires OPEN orders once {@code now >= pickupDeadline} (F8.1). Each order is expired in its own
 * locked transaction, so an acceptance racing the job is resolved by whichever locks the row
 * first. {@link OrderExpirySchedule} runs this on a timer.
 */
@Component
public class OrderExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(OrderExpiryScheduler.class);
    private static final int BATCH_SIZE = 100;

    private final OrderService orderService;

    public OrderExpiryScheduler(OrderService orderService) {
        this.orderService = orderService;
    }

    public void expireOverdueOrders() {
        List<UUID> overdue = orderService.findOverdueOpenOrderIds(BATCH_SIZE);
        int expired = 0;
        for (UUID orderId : overdue) {
            try {
                if (orderService.expireIfStillOverdue(orderId)) {
                    expired++;
                }
            } catch (RuntimeException exception) {
                // One bad order must not stop the batch; it is retried on the next run.
                log.warn("Could not expire order {}", orderId, exception);
            }
        }
        if (expired > 0) {
            log.info("Expired {} overdue order(s)", expired);
        }
    }
}
