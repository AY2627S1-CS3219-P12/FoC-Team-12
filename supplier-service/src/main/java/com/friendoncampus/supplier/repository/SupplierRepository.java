package com.friendoncampus.supplier.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import com.friendoncampus.supplier.domain.Supplier;

public interface SupplierRepository
        extends JpaRepository<Supplier, UUID>, JpaSpecificationExecutor<Supplier> {
}
