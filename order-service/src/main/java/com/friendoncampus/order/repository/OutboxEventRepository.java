package com.friendoncampus.order.repository;

import java.time.OffsetDateTime;
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
     * Claims unpublished events a whole stream (one order's events on one topic) at a time, oldest
     * first, so several relay instances can run without publishing one order's events out of order.
     *
     * <p>A stream's oldest unpublished row is its token: the {@code heads} query locks up to
     * {@code limit} tokens with {@code FOR UPDATE SKIP LOCKED}, skipping streams another instance
     * holds. A row with an older unpublished row in its stream is never a token, so no other
     * instance can claim a later event while the earlier one is in flight. The rows behind each
     * claimed token are then locked too, so one run still sends a stream's backlog in order. At most
     * {@code limit} rows are returned; the rest wait for the next run. {@code MATERIALIZED} keeps the
     * locking query from being folded into the outer one.
     */
    @Query(value = "with heads as materialized ("
            + " select o.aggregate_id, o.topic from outbox_events o"
            + " where o.published_at is null and not exists ("
            + " select 1 from outbox_events earlier where earlier.published_at is null"
            + " and earlier.aggregate_id = o.aggregate_id and earlier.topic = o.topic"
            + " and (earlier.created_at, earlier.id) < (o.created_at, o.id))"
            + " order by o.created_at, o.id limit :limit for update of o skip locked)"
            + " select e.* from outbox_events e"
            + " join heads h on h.aggregate_id = e.aggregate_id and h.topic = e.topic"
            + " where e.published_at is null"
            + " order by e.created_at, e.id limit :limit for update of e", nativeQuery = true)
    List<OutboxEvent> claimUnpublished(@Param("limit") int limit);

    /** Size, oldest row and worst attempt count of the unpublished backlog, for the relay gauges. */
    @Query(value = "select count(*) as \"pending\","
            + " cast(coalesce(extract(epoch from (cast(:now as timestamptz) - min(created_at))), 0)"
            + " as double precision) as \"oldestAgeSeconds\","
            + " cast(coalesce(max(attempts), 0) as integer) as \"maxAttempts\""
            + " from outbox_events where published_at is null", nativeQuery = true)
    OutboxBacklog backlog(@Param("now") OffsetDateTime now);

    /** One row of {@link #backlog}. */
    interface OutboxBacklog {
        long getPending();

        double getOldestAgeSeconds();

        int getMaxAttempts();
    }
}
