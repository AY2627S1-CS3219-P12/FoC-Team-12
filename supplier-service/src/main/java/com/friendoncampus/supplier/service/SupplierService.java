package com.friendoncampus.supplier.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.dao.OptimisticLockingFailureException;
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

    @Transactional
    public Supplier createSupplier(CreateSupplierCommand command) {
        Supplier supplier = Supplier.create(
                command.name(),
                command.type(),
                command.building(),
                command.floor(),
                command.locationDescription(),
                command.latitude(),
                command.longitude(),
                command.openingTime(),
                command.closingTime(),
                command.imageUrl(),
                command.status());
        return supplierRepository.save(supplier);
    }

    @Transactional
    public Supplier updateSupplier(UUID id, UpdateSupplierCommand command) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new SupplierNotFoundException(id));

        if (supplier.getVersion() != command.version()) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    supplier.getVersion());
        }

        supplier.updateDetails(
                command.name(),
                command.type(),
                command.building(),
                command.floor(),
                command.locationDescription(),
                command.latitude(),
                command.longitude(),
                command.openingTime(),
                command.closingTime(),
                command.imageUrl());

        try {
            supplierRepository.flush();
        } catch (OptimisticLockingFailureException exception) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    null,
                    exception);
        }
        return supplier;
    }

    @Transactional
    public Supplier changeSupplierStatus(UUID id, ChangeSupplierStatusCommand command) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new SupplierNotFoundException(id));

        if (supplier.getVersion() != command.version()) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    supplier.getVersion());
        }

        if (!supplier.changeStatus(command.status())) {
            return supplier;
        }

        try {
            supplierRepository.flush();
        } catch (OptimisticLockingFailureException exception) {
            throw new SupplierUpdateConflictException(
                    id,
                    command.version(),
                    null,
                    exception);
        }
        return supplier;
    }
}
