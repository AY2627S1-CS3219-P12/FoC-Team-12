package com.friendoncampus.supplier.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.SupplierNotFoundException;
import com.friendoncampus.supplier.service.SupplierQuery;
import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.web.error.ApiExceptionHandler;

class SupplierControllerTest {

    private static final UUID ANNA_ID = UUID.fromString("ca9bd61f-93da-4500-9e9d-48de1bea52fa");

    private SupplierService supplierService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        supplierService = mock(SupplierService.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new SupplierController(supplierService))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @Test
    void listsSuppliersInsideItemsEnvelope() throws Exception {
        Supplier anna = supplier(ANNA_ID, "Anna's x Soup Union", SupplierStatus.ACTIVE);
        SupplierQuery defaultQuery = SupplierQuery.from(null, null, null, null, null, null);
        when(supplierService.listActiveSuppliers(defaultQuery)).thenReturn(new PageImpl<>(
                List.of(anna),
                PageRequest.of(0, 20, Sort.by(Sort.Order.asc("name").ignoreCase().nullsLast())),
                21));

        mockMvc.perform(get("/api/suppliers"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(ANNA_ID.toString()))
                .andExpect(jsonPath("$.items[0].name").value("Anna's x Soup Union"))
                .andExpect(jsonPath("$.items[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.items[0].version").value(0))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalItems").value(21))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void forwardsNormalizedCombinedQueryParameters() throws Exception {
        SupplierQuery expectedQuery = SupplierQuery.from(
                " coffee ", " Food ", " Central Library ", "1", "5", "building,desc");
        when(supplierService.listActiveSuppliers(expectedQuery)).thenReturn(
                new PageImpl<>(List.of(), expectedQuery.toPageRequest(), 6));

        mockMvc.perform(get("/api/suppliers")
                        .param("search", " coffee ")
                        .param("type", " Food ")
                        .param("building", " Central Library ")
                        .param("page", "1")
                        .param("size", "5")
                        .param("sort", "building,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.totalItems").value(6))
                .andExpect(jsonPath("$.totalPages").value(2));

        verify(supplierService).listActiveSuppliers(expectedQuery);
    }

    @Test
    void treatsBlankSearchAndFiltersAsAbsent() throws Exception {
        SupplierQuery expectedQuery = SupplierQuery.from(" ", "", "  ", null, null, null);
        when(supplierService.listActiveSuppliers(expectedQuery)).thenReturn(
                new PageImpl<>(List.of(), expectedQuery.toPageRequest(), 0));

        mockMvc.perform(get("/api/suppliers")
                        .param("search", " ")
                        .param("type", "")
                        .param("building", "  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));

        verify(supplierService).listActiveSuppliers(expectedQuery);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "page=-1", "page=one", "size=0", "size=101", "size=many",
            "sort=id,asc", "sort=name,sideways", "sort=name"
    })
    void returnsProblemDetailForInvalidListQuery(String queryString) throws Exception {
        mockMvc.perform(get("/api/suppliers?" + queryString))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier query"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").isNotEmpty());

        verifyNoInteractions(supplierService);
    }

    @Test
    void retrievesSupplierById() throws Exception {
        Supplier anna = supplier(ANNA_ID, "Anna's x Soup Union", SupplierStatus.ACTIVE);
        when(supplierService.getSupplier(ANNA_ID)).thenReturn(anna);

        mockMvc.perform(get("/api/suppliers/{id}", ANNA_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(ANNA_ID.toString()))
                .andExpect(jsonPath("$.name").value("Anna's x Soup Union"))
                .andExpect(jsonPath("$.openingTime").value("09:00:00"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    void returnsProblemDetailForUnknownSupplier() throws Exception {
        when(supplierService.getSupplier(ANNA_ID)).thenThrow(new SupplierNotFoundException(ANNA_ID));

        mockMvc.perform(get("/api/suppliers/{id}", ANNA_ID))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Supplier not found"))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("Supplier with ID " + ANNA_ID + " was not found"))
                .andExpect(jsonPath("$.supplierId").value(ANNA_ID.toString()));
    }

    @Test
    void returnsProblemDetailForMalformedSupplierId() throws Exception {
        mockMvc.perform(get("/api/suppliers/not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier ID"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("Supplier ID 'not-a-uuid' is not a valid UUID"));

        verifyNoInteractions(supplierService);
    }

    private Supplier supplier(UUID id, String name, SupplierStatus status) {
        Supplier supplier = mock(Supplier.class);
        when(supplier.getId()).thenReturn(id);
        when(supplier.getName()).thenReturn(name);
        when(supplier.getType()).thenReturn("Food");
        when(supplier.getBuilding()).thenReturn("Central Library");
        when(supplier.getFloor()).thenReturn("1");
        when(supplier.getLocationDescription()).thenReturn("Next to NUS Co-op");
        when(supplier.getLatitude()).thenReturn(1.296444);
        when(supplier.getLongitude()).thenReturn(103.773032);
        when(supplier.getOpeningTime()).thenReturn(LocalTime.of(9, 0));
        when(supplier.getClosingTime()).thenReturn(LocalTime.of(18, 0));
        when(supplier.getImageUrl()).thenReturn("https://example.com/supplier.jpg");
        when(supplier.getStatus()).thenReturn(status);
        when(supplier.getVersion()).thenReturn(0L);
        when(supplier.getCreatedAt()).thenReturn(OffsetDateTime.parse("2026-09-23T00:00:00Z"));
        when(supplier.getUpdatedAt()).thenReturn(OffsetDateTime.parse("2026-09-23T00:00:00Z"));
        return supplier;
    }
}
