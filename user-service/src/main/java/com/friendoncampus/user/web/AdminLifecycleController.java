package com.friendoncampus.user.web;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.service.AdminLifecycleService;
import com.friendoncampus.user.service.AdminLifecycleException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/api/users/admin/accounts")
@SecurityRequirement(name = "bearerAuth")
public class AdminLifecycleController {
    private final AdminLifecycleService lifecycle;

    public AdminLifecycleController(AdminLifecycleService lifecycle) {
        this.lifecycle = lifecycle;
    }

    @GetMapping
    @Operation(summary = "List accounts for a future administrator client")
    @ApiResponse(responseCode = "200", description = "Paged account summaries")
    @ApiResponse(responseCode = "403", description = "Administrator access required")
    public PageResponse list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String query,
            @ParameterObject @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Page<User> page = lifecycle.list(actorId(jwt), query, pageable);
        return new PageResponse(page.map(AccountResponse::from).getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }

    @PatchMapping("/{id}/role")
    @Operation(summary = "Promote or demote an active account")
    @ApiResponse(responseCode = "200", description = "Role changed")
    @ApiResponse(responseCode = "403", description = "Administrator access required")
    @ApiResponse(responseCode = "409", description = "Invalid role change or protected final administrator")
    public AccountResponse changeRole(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody RoleRequest request) {
        User user = request.role() == UserRole.ADMIN ? lifecycle.promote(actorId(jwt), id) : lifecycle.demote(actorId(jwt), id);
        return AccountResponse.from(user);
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Ban or reactivate an account")
    @ApiResponse(responseCode = "200", description = "Account lifecycle status changed")
    @ApiResponse(responseCode = "403", description = "Administrator access required")
    @ApiResponse(responseCode = "409", description = "Invalid lifecycle change or protected final administrator")
    public AccountResponse changeStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody StatusRequest request) {
        User user = switch (request.status()) {
            case BANNED -> lifecycle.ban(actorId(jwt), id);
            case ACTIVE -> lifecycle.reactivate(actorId(jwt), id);
            case UNVERIFIED -> throw new AdminLifecycleException("Administrators cannot set an account to UNVERIFIED");
        };
        return AccountResponse.from(user);
    }

    private UUID actorId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }

    public record RoleRequest(@NotNull UserRole role) {
    }

    public record StatusRequest(@NotNull UserStatus status) {
    }

    public record AccountResponse(UUID userId, String email, String username, String role, String status,
            OffsetDateTime createdAt) {
        static AccountResponse from(User user) {
            return new AccountResponse(user.getId(), user.getEmail(), user.getUsername(), user.getRole().name(),
                    user.getStatus().name(), user.getCreatedAt());
        }
    }

    public record PageResponse(List<AccountResponse> content, int page, int size, long totalElements, int totalPages) {
    }
}
