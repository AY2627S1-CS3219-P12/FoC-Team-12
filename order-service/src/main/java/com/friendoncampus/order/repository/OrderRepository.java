package com.friendoncampus.order.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;

import jakarta.persistence.LockModeType;

public interface OrderRepository extends JpaRepository<Order, UUID>, JpaSpecificationExecutor<Order> {

    /**
     * Takes the order's next lifecycle {@code sourceSequence} inside the caller's transaction. A
     * plain column update, so it neither bumps the JPA version nor needs the entity reloaded; a
     * rollback returns the number, keeping the stream gap-free.
     */
    @Query(value = "update orders set lifecycle_sequence = lifecycle_sequence + 1 where id = :id"
            + " returning lifecycle_sequence", nativeQuery = true)
    long nextLifecycleSequence(@Param("id") UUID id);

    /**
     * Loads the order with a row lock ({@code SELECT … FOR UPDATE}) so concurrent transitions on the
     * same order run one at a time; the first one processed wins.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") UUID id);

    /** The order this requester already created with {@code idempotencyKey}, if any. */
    Optional<Order> findByRequesterIdAndIdempotencyKey(UUID requesterId, String idempotencyKey);

    /**
     * Serialises create requests that share one requester and {@code Idempotency-Key}: a
     * transaction-scoped advisory lock, released at commit or rollback. A second request waits for
     * the first to commit and then finds its order, instead of failing on the unique index.
     */
    @Query(value = "select true from pg_advisory_xact_lock(hashtextextended(:lockKey, 0))", nativeQuery = true)
    Boolean lockIdempotencyKey(@Param("lockKey") String lockKey);

    /** IDs of orders in the given state whose deadline is at or before {@code now}, oldest first. */
    @Query("select o.id from Order o where o.state = :state and o.pickupDeadline <= :now"
            + " order by o.pickupDeadline asc, o.id asc")
    List<UUID> findIdsDueBy(@Param("state") OrderState state, @Param("now") OffsetDateTime now, Pageable page);
}
