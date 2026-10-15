package com.friendoncampus.credit.domain;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "credit_accounts")
public class CreditAccount {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "available_balance", nullable = false)
    private int availableBalance;

    @Column(name = "reserved_balance", nullable = false)
    private int reservedBalance;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected CreditAccount() {
    }

    public static CreditAccount empty(UUID userId) {
        CreditAccount account = new CreditAccount();
        account.userId = userId;
        return account;
    }

    @PrePersist
    void prepareForCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void prepareForUpdate() {
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public UUID getUserId() {
        return userId;
    }

    public int getAvailableBalance() {
        return availableBalance;
    }

    public int getReservedBalance() {
        return reservedBalance;
    }

    public int getTotalBalance() {
        return availableBalance + reservedBalance;
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
}
