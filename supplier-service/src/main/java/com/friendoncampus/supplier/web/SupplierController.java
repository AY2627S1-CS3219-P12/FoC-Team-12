package com.friendoncampus.supplier.web;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.web.dto.SupplierListResponse;
import com.friendoncampus.supplier.web.dto.SupplierResponse;

@RestController
@RequestMapping("/api/suppliers")
public class SupplierController {

    private final SupplierService supplierService;

    public SupplierController(SupplierService supplierService) {
        this.supplierService = supplierService;
    }

    @GetMapping
    public SupplierListResponse listSuppliers() {
        return SupplierListResponse.from(supplierService.listActiveSuppliers());
    }

    @GetMapping("/{id}")
    public SupplierResponse getSupplier(@PathVariable UUID id) {
        return SupplierResponse.from(supplierService.getSupplier(id));
    }
}
