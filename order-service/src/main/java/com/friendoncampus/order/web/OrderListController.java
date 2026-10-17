package com.friendoncampus.order.web;

import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.order.service.OrderPaging;
import com.friendoncampus.order.service.OrderPoolQuery;
import com.friendoncampus.order.service.OrderQueryService;
import com.friendoncampus.order.web.dto.OrderPageResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * List reads: the open-order pool (F4) and the caller's history (F9). Any signed-in session role
 * may call them; the caller is always the verified JWT subject. The {@code /me/...} paths have two
 * segments, so they never match {@code GET /api/orders/{id}}.
 */
@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Create and manage campus errand orders")
@SecurityRequirement(name = "bearer-jwt")
public class OrderListController {

    private final OrderQueryService orderQueryService;

    public OrderListController(OrderQueryService orderQueryService) {
        this.orderQueryService = orderQueryService;
    }

    @Operation(
            operationId = "listOpenOrders",
            summary = "Browse the open-order pool",
            description = "OPEN orders whose pickup deadline is still ahead, with no reward change "
                    + "pending, excluding the caller's own requests. Filters combine with AND. No "
                    + "matches returns 200 with an empty page.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Page of available orders",
                    content = @Content(schema = @Schema(implementation = OrderPageResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "INVALID_QUERY: malformed or out-of-range filter, sort or paging value",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping
    public OrderPageResponse listOpenOrders(
            @AuthenticationPrincipal Jwt jwt,
            @Parameter(description = "Lowest reward in credits (inclusive)",
                    schema = @Schema(type = "integer", minimum = "1"), example = "5")
            @RequestParam(required = false) String minReward,
            @Parameter(description = "Highest reward in credits (inclusive); must be >= minReward",
                    schema = @Schema(type = "integer", minimum = "1"), example = "20")
            @RequestParam(required = false) String maxReward,
            @Parameter(description = "Supplier location UUID the item is picked up from",
                    schema = @Schema(type = "string", format = "uuid"))
            @RequestParam(required = false) String pickupLocationId,
            @Parameter(description = "Supplier location UUID the item is delivered to",
                    schema = @Schema(type = "string", format = "uuid"))
            @RequestParam(required = false) String dropoffLocationId,
            @Parameter(description = "reward (highest first), deadline (nearest pickup deadline first) "
                    + "or pickupLocationName (A to Z, ignoring case)",
                    schema = @Schema(type = "string", allowableValues = {"deadline", "reward", "pickupLocationName"},
                            defaultValue = "deadline"))
            @RequestParam(required = false) String sort,
            @Parameter(description = "Zero-based page number",
                    schema = @Schema(type = "integer", minimum = "0", defaultValue = "0"))
            @RequestParam(required = false) String page,
            @Parameter(description = "Orders per page",
                    schema = @Schema(type = "integer", minimum = "1", maximum = "50", defaultValue = "20"))
            @RequestParam(required = false) String size) {
        OrderPoolQuery query = OrderPoolQuery.from(minReward, maxReward, pickupLocationId,
                dropoffLocationId, sort, page, size);
        return OrderPageResponse.from(orderQueryService.findOpenPool(callerId(jwt), query));
    }

    @Operation(
            operationId = "listMyRequestedOrders",
            summary = "My finished requests",
            description = "The caller's own orders in COMPLETED, CANCELLED or EXPIRED, newest state "
                    + "change first.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Page of the caller's finished requests",
                    content = @Content(schema = @Schema(implementation = OrderPageResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "INVALID_QUERY: malformed or out-of-range paging value",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping("/me/requested")
    public OrderPageResponse listMyRequestedOrders(
            @AuthenticationPrincipal Jwt jwt,
            @Parameter(description = "Zero-based page number",
                    schema = @Schema(type = "integer", minimum = "0", defaultValue = "0"))
            @RequestParam(required = false) String page,
            @Parameter(description = "Orders per page",
                    schema = @Schema(type = "integer", minimum = "1", maximum = "50", defaultValue = "20"))
            @RequestParam(required = false) String size) {
        return OrderPageResponse.from(
                orderQueryService.findRequestedHistory(callerId(jwt), OrderPaging.from(page, size)));
    }

    @Operation(
            operationId = "listMyDeliveredOrders",
            summary = "My completed deliveries",
            description = "COMPLETED orders the caller delivered as courier, newest completion first.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Page of the caller's completed deliveries",
                    content = @Content(schema = @Schema(implementation = OrderPageResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "INVALID_QUERY: malformed or out-of-range paging value",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping("/me/delivered")
    public OrderPageResponse listMyDeliveredOrders(
            @AuthenticationPrincipal Jwt jwt,
            @Parameter(description = "Zero-based page number",
                    schema = @Schema(type = "integer", minimum = "0", defaultValue = "0"))
            @RequestParam(required = false) String page,
            @Parameter(description = "Orders per page",
                    schema = @Schema(type = "integer", minimum = "1", maximum = "50", defaultValue = "20"))
            @RequestParam(required = false) String size) {
        return OrderPageResponse.from(
                orderQueryService.findDeliveredHistory(callerId(jwt), OrderPaging.from(page, size)));
    }

    private static UUID callerId(Jwt jwt) {
        // The decoder guarantees a present, UUID-shaped 'sub'.
        return UUID.fromString(jwt.getSubject());
    }
}
