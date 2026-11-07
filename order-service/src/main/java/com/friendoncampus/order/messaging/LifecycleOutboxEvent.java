package com.friendoncampus.order.messaging;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import jakarta.persistence.*;

@Entity @Table(name="lifecycle_outbox_events")
public class LifecycleOutboxEvent {
    @Id private UUID id;
    @Column(name="aggregate_id",nullable=false) private UUID aggregateId;
    @Column(name="aggregate_version",nullable=false) private long aggregateVersion;
    @Column(name="source_sequence",nullable=false) private long sourceSequence;
    @Column(name="event_type",nullable=false,length=64) private String eventType;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") private String payload;
    @Column(name="created_at",nullable=false) private OffsetDateTime createdAt;
    @Column(name="published_at") private OffsetDateTime publishedAt;
    @Column(nullable=false) private int attempts;
    protected LifecycleOutboxEvent(){}
    public LifecycleOutboxEvent(UUID id,UUID aggregateId,long aggregateVersion,long sourceSequence,String eventType,String payload,OffsetDateTime createdAt){this.id=id;this.aggregateId=aggregateId;this.aggregateVersion=aggregateVersion;this.sourceSequence=sourceSequence;this.eventType=eventType;this.payload=payload;this.createdAt=createdAt;}
    public UUID getId(){return id;} public UUID getAggregateId(){return aggregateId;} public String getPayload(){return payload;} public int getAttempts(){return attempts;}
    public void markPublished(OffsetDateTime at){publishedAt=at;} public void recordFailedAttempt(){attempts++;}
}
