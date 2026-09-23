package com.friendoncampus.supplier.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;

public interface SupplierRepository extends JpaRepository<Supplier, UUID> {

    List<Supplier> findAllByStatus(SupplierStatus status, Sort sort);
}
