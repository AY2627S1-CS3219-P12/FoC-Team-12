package com.friendoncampus.supplier.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class SupplierTest {

    @Test
    void createsSupplierWithInitialVersionAndLifecycleTimestamps() {
        Supplier supplier = Supplier.create(
                "New Campus Cafe",
                "Food/Coffee",
                "COM3",
                null,
                null,
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                null,
                null,
                SupplierStatus.ACTIVE);

        assertThat(supplier.getVersion()).isZero();
        assertThat(supplier.getCreatedAt()).isNull();
        assertThat(supplier.getUpdatedAt()).isNull();

        supplier.prepareForCreate();

        assertThat(supplier.getCreatedAt()).isNotNull();
        assertThat(supplier.getUpdatedAt()).isEqualTo(supplier.getCreatedAt());
        assertThat(supplier.getCreatedAt().getOffset()).isEqualTo(ZoneOffset.UTC);

        OffsetDateTime createdAt = supplier.getCreatedAt();
        supplier.prepareForUpdate();

        assertThat(supplier.getCreatedAt()).isEqualTo(createdAt);
        assertThat(supplier.getUpdatedAt()).isAfterOrEqualTo(createdAt);
    }
}
