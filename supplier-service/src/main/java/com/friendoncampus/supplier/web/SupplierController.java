package com.friendoncampus.supplier.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.supplier.service.SupplierQuery;
import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.web.dto.ChangeSupplierStatusRequest;
import com.friendoncampus.supplier.web.dto.CreateSupplierRequest;
import com.friendoncampus.supplier.web.dto.SupplierListResponse;
import com.friendoncampus.supplier.web.dto.SupplierResponse;
import com.friendoncampus.supplier.web.dto.UpdateSupplierRequest;

import jakarta.validation.Valid;

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

    @PostMapping
    public ResponseEntity<SupplierResponse> createSupplier(
            @Valid @RequestBody CreateSupplierRequest request) {
        SupplierResponse response = SupplierResponse.from(
                supplierService.createSupplier(request.toCommand()));
        URI location = URI.create("/api/suppliers/" + response.id());
        return ResponseEntity.created(location).body(response);
    }

    @PutMapping("/{id}")
    public SupplierResponse updateSupplier(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateSupplierRequest request) {
        return SupplierResponse.from(supplierService.updateSupplier(id, request.toCommand()));
    }

    @PatchMapping("/{id}/status")
    public SupplierResponse changeSupplierStatus(
            @PathVariable UUID id,
            @Valid @RequestBody ChangeSupplierStatusRequest request) {
        return SupplierResponse.from(
                supplierService.changeSupplierStatus(id, request.toCommand()));
    }
}
