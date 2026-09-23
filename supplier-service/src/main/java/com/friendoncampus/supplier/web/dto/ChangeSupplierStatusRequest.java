package com.friendoncampus.supplier.web.dto;

import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.ChangeSupplierStatusCommand;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record ChangeSupplierStatusRequest(
        @NotNull SupplierStatus status,
        @NotNull @PositiveOrZero Long version) {

    public ChangeSupplierStatusCommand toCommand() {
        return new ChangeSupplierStatusCommand(status, version);
    }
}
