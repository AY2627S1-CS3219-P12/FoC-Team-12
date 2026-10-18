package com.friendoncampus.order.messaging;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.repository.OutboxEventRepository;

/**
 * Publishes {@code outbox_events} rows to Kafka (blueprint "Every producer"): each row is sent with
 * its stored {@code eventId}, payload and order UUID key; {@code published_at} is set only after
 * Kafka acknowledges, and a failed send stays pending with its attempt count increased.
 *
 * <p>Within one run, once an order's event fails, that order's later events wait, so events for
 * one order are never published out of order.
 */
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxEventRepository outboxEventRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final Clock clock;
    private final int batchSize;
    private final Duration sendTimeout;

    public OutboxRelay(OutboxEventRepository outboxEventRepository, KafkaTemplate<String, String> kafkaTemplate,
            Clock clock, int batchSize, Duration sendTimeout) {
        this.outboxEventRepository = outboxEventRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.clock = clock;
        this.batchSize = batchSize;
        this.sendTimeout = sendTimeout;
    }

    /** Sends one batch; returns how many events Kafka acknowledged. */
    @Transactional
    public int publishPending() {
        List<OutboxEvent> batch = outboxEventRepository.claimUnpublished(batchSize);
        Set<UUID> blockedOrders = new HashSet<>();
        int published = 0;
        for (OutboxEvent event : batch) {
            if (blockedOrders.contains(event.getAggregateId())) {
                continue;
            }
            try {
                kafkaTemplate.send(event.getTopic(), event.getAggregateId().toString(), event.getPayload())
                        .get(sendTimeout.toMillis(), TimeUnit.MILLISECONDS);
                event.markPublished(OffsetDateTime.now(clock));
                published++;
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                failed(event, blockedOrders, exception);
                break;
            } catch (Exception exception) {
                failed(event, blockedOrders, exception);
            }
        }
        if (published > 0) {
            log.info("Published {} order event(s) to Kafka", published);
        }
        return published;
    }

    private static void failed(OutboxEvent event, Set<UUID> blockedOrders, Exception exception) {
        event.recordFailedAttempt();
        blockedOrders.add(event.getAggregateId());
        log.warn("Could not publish eventId={} eventType={} operationId={} orderId={} attempts={}",
                event.getId(), event.getEventType(), event.getOperationId(), event.getAggregateId(),
                event.getAttempts(), exception);
    }
}
