package com.friendoncampus.supplier.web.dto;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;

public record SupplierResponse(
        UUID id,
        String name,
        String type,
        String building,
        String floor,
        String locationDescription,
        double latitude,
        double longitude,
        LocalTime openingTime,
        LocalTime closingTime,
        String imageUrl,
        SupplierStatus status,
        long version,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public static SupplierResponse from(Supplier supplier) {
        return new SupplierResponse(
                supplier.getId(),
                supplier.getName(),
                supplier.getType(),
                supplier.getBuilding(),
                supplier.getFloor(),
                supplier.getLocationDescription(),
                supplier.getLatitude(),
                supplier.getLongitude(),
                supplier.getOpeningTime(),
                supplier.getClosingTime(),
                supplier.getImageUrl(),
                supplier.getStatus(),
                supplier.getVersion(),
                supplier.getCreatedAt(),
                supplier.getUpdatedAt());
    }
}
