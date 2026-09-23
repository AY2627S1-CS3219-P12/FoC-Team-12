package com.friendoncampus.supplier.web.dto;

import java.util.List;

import org.springframework.data.domain.Page;

import com.friendoncampus.supplier.domain.Supplier;

public record SupplierListResponse(
        List<SupplierResponse> items,
        int page,
        int size,
        long totalItems,
        int totalPages) {

    public SupplierListResponse {
        items = List.copyOf(items);
    }

    public static SupplierListResponse from(Page<Supplier> suppliers) {
        return new SupplierListResponse(
                suppliers.getContent().stream()
                        .map(SupplierResponse::from)
                        .toList(),
                suppliers.getNumber(),
                suppliers.getSize(),
                suppliers.getTotalElements(),
                suppliers.getTotalPages());
    }
}
