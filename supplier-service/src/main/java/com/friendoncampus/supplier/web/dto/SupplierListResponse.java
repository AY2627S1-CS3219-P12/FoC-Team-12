package com.friendoncampus.supplier.web.dto;

import java.util.List;

import com.friendoncampus.supplier.domain.Supplier;

public record SupplierListResponse(List<SupplierResponse> items) {

    public SupplierListResponse {
        items = List.copyOf(items);
    }

    public static SupplierListResponse from(List<Supplier> suppliers) {
        return new SupplierListResponse(suppliers.stream()
                .map(SupplierResponse::from)
                .toList());
    }
}
