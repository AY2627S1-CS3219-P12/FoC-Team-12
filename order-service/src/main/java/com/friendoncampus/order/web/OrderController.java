package com.friendoncampus.order.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.dto.CreateOrderRequest;
import com.friendoncampus.order.web.dto.OrderResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Create and manage campus errand orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @Operation(
            operationId = "createOrder",
            summary = "Create an order",
            description = "Validates and stores a new order in PENDING_CREDIT. The requester is taken "
                    + "from the X-User-Id header; auth-based identity replaces this later.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "201",
                    description = "Order created in PENDING_CREDIT",
                    headers = @Header(
                            name = "Location",
                            description = "Relative URL of the created order",
                            schema = @Schema(type = "string", example = "/api/orders/9fd58f13-c8d5-4320-b757-7893d69a4ae0")),
                    content = @Content(schema = @Schema(implementation = OrderResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Missing or malformed X-User-Id, or missing/invalid order fields",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(
            @Parameter(description = "Requester's user UUID", required = true, example = "97947588-bb2e-42f2-91ba-9abf8e15a8e7")
            @RequestHeader("X-User-Id") UUID requesterId,
            @Valid @RequestBody CreateOrderRequest request) {
        OrderResponse response = OrderResponse.from(
                orderService.createOrder(request.toCommand(requesterId)));
        URI location = URI.create("/api/orders/" + response.id());
        return ResponseEntity.created(location).body(response);
    }
}
