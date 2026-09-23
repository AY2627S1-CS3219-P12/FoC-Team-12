package com.friendoncampus.supplier.web;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.supplier.service.SupplierQuery;
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
    public SupplierListResponse listSuppliers(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String building,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) String sort) {
        SupplierQuery query = SupplierQuery.from(search, type, building, page, size, sort);
        return SupplierListResponse.from(supplierService.listActiveSuppliers(query));
    }

    @GetMapping("/{id}")
    public SupplierResponse getSupplier(@PathVariable UUID id) {
        return SupplierResponse.from(supplierService.getSupplier(id));
    }
}
