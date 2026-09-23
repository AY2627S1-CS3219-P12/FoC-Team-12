package com.friendoncampus.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.repository.SupplierRepository;

class SupplierServiceTest {

    private SupplierRepository supplierRepository;
    private SupplierService supplierService;

    @BeforeEach
    void setUp() {
        supplierRepository = mock(SupplierRepository.class);
        supplierService = new SupplierService(supplierRepository);
    }

    @Test
    void listsActiveSuppliersInRepositoryOrder() {
        Supplier anna = supplierNamed("Anna's x Soup Union");
        Supplier heBrews = supplierNamed("he by He Brews");
        Supplier nusCoOp = supplierNamed("NUS Co-op");
        Sort nameAscending = Sort.by(Sort.Order.asc("name").ignoreCase());
        when(supplierRepository.findAllByStatus(SupplierStatus.ACTIVE, nameAscending))
                .thenReturn(List.of(anna, heBrews, nusCoOp));

        List<Supplier> result = supplierService.listActiveSuppliers();

        assertThat(result).containsExactly(anna, heBrews, nusCoOp);
        assertThat(result).extracting(Supplier::getName)
                .containsExactly("Anna's x Soup Union", "he by He Brews", "NUS Co-op");
        verify(supplierRepository).findAllByStatus(SupplierStatus.ACTIVE, nameAscending);
    }

    @Test
    void retrievesSupplierById() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        Supplier result = supplierService.getSupplier(id);

        assertThat(result).isSameAs(supplier);
    }

    @Test
    void retrievesInactiveSupplierById() {
        UUID id = UUID.randomUUID();
        Supplier supplier = mock(Supplier.class);
        when(supplier.getStatus()).thenReturn(SupplierStatus.INACTIVE);
        when(supplierRepository.findById(id)).thenReturn(Optional.of(supplier));

        Supplier result = supplierService.getSupplier(id);

        assertThat(result.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
    }

    @Test
    void rejectsUnknownSupplierId() {
        UUID id = UUID.randomUUID();
        when(supplierRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> supplierService.getSupplier(id))
                .isInstanceOf(SupplierNotFoundException.class)
                .hasMessage("Supplier with ID " + id + " was not found")
                .extracting("supplierId")
                .isEqualTo(id);
    }

    private Supplier supplierNamed(String name) {
        Supplier supplier = mock(Supplier.class);
        when(supplier.getName()).thenReturn(name);
        return supplier;
    }
}
