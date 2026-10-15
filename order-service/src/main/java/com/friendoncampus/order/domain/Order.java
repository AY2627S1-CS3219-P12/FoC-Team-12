package com.friendoncampus.order.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/**
 * Order aggregate. This iteration maps only the fields required to create an
 * order in {@link OrderState#PENDING_CREDIT}; nullable lifecycle columns
 * (courier, snapshots, credit reservation, terminal reason, transition
 * timestamps) are left to the database defaults and future iterations.
 */
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "requester_id", nullable = false)
    private UUID requesterId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, length = 2000)
    private String description;

    @Column(name = "pickup_location_id", nullable = false)
    private UUID pickupLocationId;

    @Column(name = "dropoff_location_id", nullable = false)
    private UUID dropoffLocationId;

    @Column(name = "credit_reward", nullable = false)
    private int creditReward;

    @Column(name = "pickup_deadline", nullable = false)
    private OffsetDateTime pickupDeadline;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private OrderState state;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "state_changed_at", nullable = false)
    private OffsetDateTime stateChangedAt;

    protected Order() {
    }

    /**
     * Creates a new order awaiting a credit reservation. The order always starts
     * in {@link OrderState#PENDING_CREDIT}; Credit Service later drives it to OPEN
     * or RESERVATION_FAILED via the event flow.
     */
    public static Order submit(
            UUID requesterId,
            String title,
            String description,
            UUID pickupLocationId,
            UUID dropoffLocationId,
            int creditReward,
            OffsetDateTime pickupDeadline) {
        Order order = new Order();
        order.requesterId = requesterId;
        order.title = title;
        order.description = description;
        order.pickupLocationId = pickupLocationId;
        order.dropoffLocationId = dropoffLocationId;
        order.creditReward = creditReward;
        order.pickupDeadline = pickupDeadline;
        order.state = OrderState.PENDING_CREDIT;
        return order;
    }

    @PrePersist
    void prepareForCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
        stateChangedAt = now;
    }

    @PreUpdate
    void prepareForUpdate() {
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public UUID getId() {
        return id;
    }

    public UUID getRequesterId() {
        return requesterId;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public UUID getPickupLocationId() {
        return pickupLocationId;
    }

    public UUID getDropoffLocationId() {
        return dropoffLocationId;
    }

    public int getCreditReward() {
        return creditReward;
    }

    public OffsetDateTime getPickupDeadline() {
        return pickupDeadline;
    }

    public OrderState getState() {
        return state;
    }

    public long getVersion() {
        return version;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public OffsetDateTime getStateChangedAt() {
        return stateChangedAt;
    }
}
