package com.friendoncampus.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.same;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

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
    @SuppressWarnings("unchecked")
    void listsSuppliersUsingCombinedSpecificationAndSafePageRequest() {
        Supplier anna = supplierNamed("Anna's x Soup Union");
        Supplier heBrews = supplierNamed("he by He Brews");
        SupplierQuery query = SupplierQuery.from(
                " coffee ", " Food ", " Central Library ", "1", "2", "building,desc");
        PageRequest pageRequest = query.toPageRequest();
        Page<Supplier> repositoryPage = new PageImpl<>(
                List.of(anna, heBrews),
                pageRequest,
                5);
        when(supplierRepository.findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(pageRequest)))
                .thenReturn(repositoryPage);

        Page<Supplier> result = supplierService.listActiveSuppliers(query);

        assertThat(result).isSameAs(repositoryPage);
        assertThat(result.getContent()).containsExactly(anna, heBrews);
        ArgumentCaptor<Specification<Supplier>> specificationCaptor =
                ArgumentCaptor.forClass(Specification.class);
        verify(supplierRepository).findAll(
                specificationCaptor.capture(),
                org.mockito.ArgumentMatchers.eq(pageRequest));
        assertThat(specificationCaptor.getValue()).isNotNull();
    }

    @Test
    void usesDefaultPaginationAndNameOrder() {
        SupplierQuery query = SupplierQuery.from(null, null, null, null, null, null);
        PageRequest expectedPageRequest = PageRequest.of(
                0,
                20,
                Sort.by(Sort.Order.asc("name").ignoreCase().nullsLast()));
        when(supplierRepository.findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(expectedPageRequest)))
                .thenReturn(Page.empty(expectedPageRequest));

        Page<Supplier> result = supplierService.listActiveSuppliers(query);

        assertThat(result).isEmpty();
        verify(supplierRepository).findAll(
                org.mockito.ArgumentMatchers.<Specification<Supplier>>any(),
                org.mockito.ArgumentMatchers.eq(expectedPageRequest));
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

    @Test
    void createsAndPersistsSupplierFromCommand() {
        CreateSupplierCommand command = new CreateSupplierCommand(
                "New Campus Cafe",
                "Food/Coffee",
                "COM3",
                "1",
                "Beside the main entrance",
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                LocalTime.of(18, 0),
                "https://example.com/cafe.jpg",
                SupplierStatus.INACTIVE);
        when(supplierRepository.save(org.mockito.ArgumentMatchers.any(Supplier.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Supplier result = supplierService.createSupplier(command);

        assertThat(result.getName()).isEqualTo("New Campus Cafe");
        assertThat(result.getType()).isEqualTo("Food/Coffee");
        assertThat(result.getBuilding()).isEqualTo("COM3");
        assertThat(result.getFloor()).isEqualTo("1");
        assertThat(result.getLocationDescription()).isEqualTo("Beside the main entrance");
        assertThat(result.getLatitude()).isEqualTo(1.2948);
        assertThat(result.getLongitude()).isEqualTo(103.7716);
        assertThat(result.getOpeningTime()).isEqualTo(LocalTime.of(8, 0));
        assertThat(result.getClosingTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(result.getImageUrl()).isEqualTo("https://example.com/cafe.jpg");
        assertThat(result.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        assertThat(result.getVersion()).isZero();
        verify(supplierRepository).save(same(result));
    }

    private Supplier supplierNamed(String name) {
        Supplier supplier = mock(Supplier.class);
        when(supplier.getName()).thenReturn(name);
        return supplier;
    }
}
