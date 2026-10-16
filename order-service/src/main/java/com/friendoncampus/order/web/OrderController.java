package com.friendoncampus.order.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.dto.CreateOrderRequest;
import com.friendoncampus.order.web.dto.OrderResponse;
import com.friendoncampus.order.web.dto.OrderTransitionResponse;

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

    @Operation(
            operationId = "getOrder",
            summary = "Get an order",
            description = "OPEN orders are visible to any signed-in user. In any other state only the "
                    + "requester or the assigned courier can see the order; anyone else gets 404.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The order"),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping("/{id}")
    public OrderResponse getOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.getOrder(id, callerId(jwt)));
    }

    @Operation(
            operationId = "getOrderHistory",
            summary = "Get an order's transition history",
            description = "Every state change in the order it happened. Visible to the requester and "
                    + "the assigned courier only.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The transitions, oldest first"),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller is not a participant",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping("/{id}/history")
    public List<OrderTransitionResponse> getOrderHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return orderService.getHistory(id, callerId(jwt)).stream()
                .map(OrderTransitionResponse::from)
                .toList();
    }

    @Operation(
            operationId = "cancelOrder",
            summary = "Cancel an order",
            description = "The requester cancels an OPEN order (full credit release) or an ACCEPTED order "
                    + "(the courier is compensated). Not allowed once the order is picked up. Repeating "
                    + "a cancel returns the cancelled order without any further effect. Requires a "
                    + "REQUESTER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The cancelled order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "Not the order's requester, or the session role is not REQUESTER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "CANCELLATION_NOT_ALLOWED after pickup, or INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/cancel")
    public OrderResponse cancelOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.cancel(id, callerId(jwt)));
    }

    @Operation(
            operationId = "acceptOrder",
            summary = "Accept an order",
            description = "A courier accepts an OPEN order before its pickup deadline and becomes its "
                    + "assigned courier. If several couriers accept at once, only the first one processed "
                    + "succeeds. Requesters cannot accept their own orders. Repeating an acceptance you "
                    + "already made returns the order unchanged. Requires a COURIER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The accepted order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "SELF_ACCEPTANCE_FORBIDDEN, or the session role is not COURIER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "ORDER_ALREADY_ACCEPTED (another courier won), ORDER_EXPIRED, or "
                            + "INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/accept")
    public OrderResponse acceptOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.accept(id, callerId(jwt)));
    }

    @Operation(
            operationId = "withdrawFromOrder",
            summary = "Withdraw from an accepted order",
            description = "The assigned courier withdraws before pickup. Before the pickup deadline the "
                    + "order reopens for other couriers; at or after the deadline it expires. Not allowed "
                    + "once picked up. Requires a COURIER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The reopened or expired order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "NOT_ASSIGNED_COURIER, or the session role is not COURIER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "CANCELLATION_NOT_ALLOWED after pickup, or INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/withdraw")
    public OrderResponse withdrawFromOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.withdraw(id, callerId(jwt)));
    }

    private static UUID callerId(Jwt jwt) {
        // The decoder guarantees a present, UUID-shaped 'sub'; identity comes only from the token.
        return UUID.fromString(jwt.getSubject());
    }
}
