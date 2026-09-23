package com.friendoncampus.supplier.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.repository.SupplierRepository;
import com.friendoncampus.supplier.repository.SupplierSpecifications;

@Service
@Transactional(readOnly = true)
public class SupplierService {

    private final SupplierRepository supplierRepository;

    public SupplierService(SupplierRepository supplierRepository) {
        this.supplierRepository = supplierRepository;
    }

    public Page<Supplier> listActiveSuppliers(SupplierQuery supplierQuery) {
        Specification<Supplier> specification = SupplierSpecifications.isActive();

        if (supplierQuery.search() != null) {
            specification = specification.and(
                    SupplierSpecifications.matchesSearch(supplierQuery.search()));
        }
        if (supplierQuery.type() != null) {
            specification = specification.and(
                    SupplierSpecifications.hasType(supplierQuery.type()));
        }
        if (supplierQuery.building() != null) {
            specification = specification.and(
                    SupplierSpecifications.isInBuilding(supplierQuery.building()));
        }

        return supplierRepository.findAll(specification, supplierQuery.toPageRequest());
    }

    public Supplier getSupplier(UUID id) {
        return supplierRepository.findById(id)
                .orElseThrow(() -> new SupplierNotFoundException(id));
    }
}
