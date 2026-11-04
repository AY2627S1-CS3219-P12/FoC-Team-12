package com.friendoncampus.notification.messaging;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Inbox receipt for one consumed Kafka event ({@code notification_inbox}). */
@Entity
@Table(name = "notification_inbox")
public class ProcessedEvent {

    @Id
    @Column(name = "event_id")
    private UUID eventId;

    @Column(nullable = false, length = 64)
    private String topic;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(name = "aggregate_id", nullable = false)
    private UUID aggregateId;

    @Column(name = "correlation_id", nullable = false)
    private UUID correlationId;

    @Column(nullable = false, length = 64)
    private String fingerprint;

    @Column(nullable = false, length = 32)
    private String outcome;

    @Column(name = "processed_at", nullable = false)
    private OffsetDateTime processedAt;

    protected ProcessedEvent() {
    }

    public ProcessedEvent(UUID eventId, String topic, String eventType, UUID aggregateId, UUID correlationId,
            String fingerprint, String outcome, OffsetDateTime processedAt) {
        this.eventId = eventId;
        this.topic = topic;
        this.eventType = eventType;
        this.aggregateId = aggregateId;
        this.correlationId = correlationId;
        this.fingerprint = fingerprint;
        this.outcome = outcome;
        this.processedAt = processedAt;
    }

    public UUID getEventId() {
        return eventId;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public String getOutcome() {
        return outcome;
    }
}
