package com.friendoncampus.supplier.web;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.supplier.service.AdminSupplierQuery;
import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.web.dto.SupplierListResponse;
import com.friendoncampus.supplier.web.dto.SupplierMetadataResponse;
import com.friendoncampus.supplier.web.error.ApiErrorDocumentation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/admin/suppliers")
@Tag(
        name = "Supplier administration",
        description = "Administrative Supplier queries restricted to the ADMIN role")
@SecurityRequirement(name = "bearerAuth")
public class AdminSupplierController {

    private final SupplierService supplierService;

    public AdminSupplierController(SupplierService supplierService) {
        this.supplierService = supplierService;
    }

    @Operation(
            operationId = "listSuppliersForAdmin",
            summary = "List suppliers for administration",
            description = "Searches active and inactive suppliers. An optional status filter narrows the results. Requires an ADMIN access token.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Page of matching suppliers",
                    content = @Content(schema = @Schema(implementation = SupplierListResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Invalid status, pagination, or sort query",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.InvalidRequest.class))),
            @ApiResponse(
                    responseCode = "401",
                    description = "Bearer token is missing or invalid",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Unauthorized.class))),
            @ApiResponse(
                    responseCode = "403",
                    description = "Authenticated user is not an administrator",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Forbidden.class)))
    })
    @GetMapping
    public SupplierListResponse listSuppliers(
            @Parameter(description = "Case-insensitive partial match across name, building, and location description", example = "central")
            @RequestParam(required = false) String search,
            @Parameter(description = "Case-insensitive exact supplier type", example = "Food")
            @RequestParam(required = false) String type,
            @Parameter(description = "Case-insensitive exact building name", example = "Central Library")
            @RequestParam(required = false) String building,
            @Parameter(
                    description = "Optional supplier status. Omit to include every status.",
                    schema = @Schema(type = "string", allowableValues = {"ACTIVE", "INACTIVE"}),
                    example = "INACTIVE")
            @RequestParam(required = false) String status,
            @Parameter(
                    description = "Zero-based page number",
                    schema = @Schema(type = "integer", minimum = "0", defaultValue = "0"),
                    example = "0")
            @RequestParam(required = false) String page,
            @Parameter(
                    description = "Records per page",
                    schema = @Schema(type = "integer", minimum = "1", maximum = "100", defaultValue = "20"),
                    example = "20")
            @RequestParam(required = false) String size,
            @Parameter(
                    description = "Sort as field,direction. Fields: name, type, building, openingTime, closingTime, createdAt, updatedAt, status. Directions: asc or desc.",
                    schema = @Schema(type = "string", defaultValue = "name,asc"),
                    example = "updatedAt,desc")
            @RequestParam(required = false) String sort) {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                search, type, building, status, page, size, sort);
        return SupplierListResponse.from(supplierService.listSuppliersForAdmin(query));
    }

    @Operation(
            operationId = "getAdminSupplierMetadata",
            summary = "Get administrative supplier filter values",
            description = "Returns distinct types and buildings across active and inactive suppliers. Requires an ADMIN access token.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Filter metadata across all suppliers",
                    content = @Content(schema = @Schema(implementation = SupplierMetadataResponse.class))),
            @ApiResponse(
                    responseCode = "401",
                    description = "Bearer token is missing or invalid",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Unauthorized.class))),
            @ApiResponse(
                    responseCode = "403",
                    description = "Authenticated user is not an administrator",
                    content = @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ApiErrorDocumentation.Forbidden.class)))
    })
    @GetMapping("/metadata")
    public SupplierMetadataResponse getSupplierMetadata() {
        return SupplierMetadataResponse.from(supplierService.getAllSupplierMetadata());
    }
}
