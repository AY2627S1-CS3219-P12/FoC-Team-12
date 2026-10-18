package com.friendoncampus.order.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.order.messaging.OutboxEvent;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    List<OutboxEvent> findByAggregateIdOrderByAggregateVersionAsc(UUID aggregateId);

    Optional<OutboxEvent> findByOperationId(UUID operationId);

    /**
     * Claims the oldest unpublished events with {@code FOR UPDATE SKIP LOCKED}, so two relay
     * instances never send the same row and a slow send does not block the other instance.
     */
    @Query(value = "select * from outbox_events where published_at is null"
            + " order by created_at, id limit :limit for update skip locked", nativeQuery = true)
    List<OutboxEvent> claimUnpublished(@Param("limit") int limit);
}
