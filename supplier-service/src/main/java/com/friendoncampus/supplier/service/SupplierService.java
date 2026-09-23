package com.friendoncampus.supplier.service;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.repository.SupplierRepository;

@Service
@Transactional(readOnly = true)
public class SupplierService {

    private static final Sort NAME_ASCENDING = Sort.by(Sort.Order.asc("name").ignoreCase());

    private final SupplierRepository supplierRepository;

    public SupplierService(SupplierRepository supplierRepository) {
        this.supplierRepository = supplierRepository;
    }

    public List<Supplier> listActiveSuppliers() {
        return supplierRepository.findAllByStatus(SupplierStatus.ACTIVE, NAME_ASCENDING);
    }

    public Supplier getSupplier(UUID id) {
        return supplierRepository.findById(id)
                .orElseThrow(() -> new SupplierNotFoundException(id));
    }
}
