package com.friendoncampus.order.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.dto.CreateOrderRequest;
import com.friendoncampus.order.web.dto.OrderResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Create and manage campus errand orders")
@SecurityRequirement(name = "bearer-jwt")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @Operation(
            operationId = "createOrder",
            summary = "Create an order",
            description = "Validates and stores a new order in PENDING_CREDIT. The requester identity "
                    + "is taken from the verified User Service JWT 'sub' claim; it is never read from "
                    + "the request body or a header. Requires a REQUESTER session role.")
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
                    description = "Missing or invalid order fields",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "401",
                    description = "Missing, expired, or otherwise invalid bearer token",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "403",
                    description = "Valid token, but the session role is not REQUESTER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateOrderRequest request) {
        // The decoder guarantees a present, UUID-shaped 'sub'; identity comes only from the token.
        UUID requesterId = UUID.fromString(jwt.getSubject());
        OrderResponse response = OrderResponse.from(
                orderService.createOrder(request.toCommand(requesterId)));
        URI location = URI.create("/api/orders/" + response.id());
        return ResponseEntity.created(location).body(response);
    }
}
