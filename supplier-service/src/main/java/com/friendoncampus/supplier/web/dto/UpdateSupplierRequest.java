package com.friendoncampus.supplier.web.dto;

import java.time.LocalTime;

import com.friendoncampus.supplier.service.UpdateSupplierCommand;
import com.friendoncampus.supplier.web.validation.HttpUrl;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record UpdateSupplierRequest(
        @NotBlank @Size(max = 255) String name,
        @NotBlank @Size(max = 100) String type,
        @NotBlank @Size(max = 255) String building,
        @Size(max = 20) String floor,
        String locationDescription,
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
        LocalTime openingTime,
        LocalTime closingTime,
        @HttpUrl String imageUrl,
        @NotNull @PositiveOrZero Long version) {

    public UpdateSupplierRequest {
        name = trim(name);
        type = trim(type);
        building = trim(building);
        floor = trimToNull(floor);
        locationDescription = trimToNull(locationDescription);
        imageUrl = trimToNull(imageUrl);
    }

    public UpdateSupplierCommand toCommand() {
        return new UpdateSupplierCommand(
                name,
                type,
                building,
                floor,
                locationDescription,
                latitude,
                longitude,
                openingTime,
                closingTime,
                imageUrl,
                version);
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    private static String trimToNull(String value) {
        String trimmed = trim(value);
        return trimmed == null || trimmed.isEmpty() ? null : trimmed;
    }
}
