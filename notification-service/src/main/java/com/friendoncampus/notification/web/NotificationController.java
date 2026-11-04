package com.friendoncampus.notification.web;

import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.notification.service.NotificationPaging;
import com.friendoncampus.notification.service.NotificationQueryService;
import com.friendoncampus.notification.web.dto.NotificationPageResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * The caller's own notifications. The recipient is always the verified JWT subject; there is no
 * {@code userId} parameter, so nobody can ask for another user's notifications.
 */
@RestController
@RequestMapping("/api/notifications/me")
@Tag(name = "Notifications", description = "What happened on the signed-in user's errands and credits")
@SecurityRequirement(name = "bearer-jwt")
public class NotificationController {

    private final NotificationQueryService queryService;

    public NotificationController(NotificationQueryService queryService) {
        this.queryService = queryService;
    }

    @Operation(
            operationId = "notification_get__api_notifications_me",
            summary = "List my notifications",
            description = "The caller's notifications, newest first by when the fact happened. Any "
                    + "signed-in session role may call it; notifications belong to the account, not the role.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Page of the caller's notifications",
                    content = @Content(schema = @Schema(implementation = NotificationPageResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "INVALID_QUERY: malformed or out-of-range paging value",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "401",
                    description = "Missing or invalid bearer token",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping
    public NotificationPageResponse listMine(
            @AuthenticationPrincipal Jwt jwt,
            @Parameter(description = "Zero-based page number", schema = @Schema(type = "integer", minimum = "0",
                    defaultValue = "0"))
            @RequestParam(required = false) String page,
            @Parameter(description = "Page size", schema = @Schema(type = "integer", minimum = "1",
                    maximum = "100", defaultValue = "20"))
            @RequestParam(required = false) String size) {
        NotificationPaging paging = NotificationPaging.from(page, size);
        return NotificationPageResponse.from(queryService.listFor(UUID.fromString(jwt.getSubject()), paging));
    }
}
