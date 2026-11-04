package com.friendoncampus.notification.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;
import com.friendoncampus.notification.service.NotificationPaging;
import com.friendoncampus.notification.service.NotificationQueryService;
import com.friendoncampus.notification.web.error.ApiExceptionHandler;

/** {@code GET /api/notifications}: paging defaults and limits, response shape and the recipient. */
class NotificationControllerTest {

    private static final UUID CALLER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID ORDER_ID = UUID.fromString("3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64");

    private NotificationQueryService queryService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        queryService = mock(NotificationQueryService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new NotificationController(queryService))
                .setControllerAdvice(new ApiExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(CALLER.toString())
                .claim("role", "COURIER")
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_COURIER"))));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listsTheCallersNotificationsWithDefaultPaging() throws Exception {
        OffsetDateTime occurredAt = OffsetDateTime.of(2026, 10, 30, 9, 15, 0, 0, ZoneOffset.UTC);
        Notification notification = new Notification(UUID.randomUUID(), CALLER, NotificationType.CREDITS_RECEIVED,
                ORDER_ID, "{\"amount\":3}", UUID.randomUUID(), occurredAt, occurredAt.plusSeconds(1));
        when(queryService.listFor(eq(CALLER), any()))
                .thenReturn(new PageImpl<>(List.of(notification), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(notification.getId().toString()))
                .andExpect(jsonPath("$.items[0].type").value("CREDITS_RECEIVED"))
                .andExpect(jsonPath("$.items[0].orderId").value(ORDER_ID.toString()))
                .andExpect(jsonPath("$.items[0].params.amount").value(3))
                .andExpect(jsonPath("$.items[0].read").value(false))
                .andExpect(jsonPath("$.items[0].occurredAt").exists())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.totalPages").value(1));

        ArgumentCaptor<NotificationPaging> paging = ArgumentCaptor.forClass(NotificationPaging.class);
        verify(queryService).listFor(eq(CALLER), paging.capture());
        assertThat(paging.getValue()).isEqualTo(new NotificationPaging(0, 20));
    }

    @Test
    void anAccountLevelNotificationHasANullOrderId() throws Exception {
        OffsetDateTime occurredAt = OffsetDateTime.of(2026, 10, 30, 9, 15, 0, 0, ZoneOffset.UTC);
        Notification welcome = new Notification(UUID.randomUUID(), CALLER, NotificationType.CREDITS_WELCOME,
                null, "{\"amount\":10}", UUID.randomUUID(), occurredAt, occurredAt);
        when(queryService.listFor(eq(CALLER), any()))
                .thenReturn(new PageImpl<>(List.of(welcome), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].type").value("CREDITS_WELCOME"))
                .andExpect(jsonPath("$.items[0].orderId").doesNotExist());
    }

    @Test
    void aNullTemplateValueIsReturnedAsNull() throws Exception {
        OffsetDateTime occurredAt = OffsetDateTime.of(2026, 10, 30, 9, 15, 0, 0, ZoneOffset.UTC);
        Notification notification = new Notification(UUID.randomUUID(), CALLER, NotificationType.CREDITS_RECEIVED,
                ORDER_ID, "{\"amount\":3,\"reason\":null}", UUID.randomUUID(), occurredAt, occurredAt);
        when(queryService.listFor(eq(CALLER), any()))
                .thenReturn(new PageImpl<>(List.of(notification), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].params.amount").value(3))
                .andExpect(jsonPath("$.items[0].params.reason").isEmpty());
    }

    @Test
    void passesAValidPageAndSize() throws Exception {
        when(queryService.listFor(eq(CALLER), any())).thenReturn(new PageImpl<>(List.of(), PageRequest.of(2, 50), 0));

        mockMvc.perform(get("/api/notifications").param("page", "2").param("size", "50"))
                .andExpect(status().isOk());

        verify(queryService).listFor(CALLER, new NotificationPaging(2, 50));
    }

    @Test
    void aUserIdParameterIsIgnoredAndTheTokenSubjectIsUsed() throws Exception {
        when(queryService.listFor(eq(CALLER), any())).thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/notifications").param("userId", UUID.randomUUID().toString()))
                .andExpect(status().isOk());

        verify(queryService).listFor(eq(CALLER), any());
    }

    @ParameterizedTest
    @CsvSource({
            "page, -1",
            "page, abc",
            "page, ''",
            "size, 0",
            "size, 51",
            "size, 1.5"
    })
    void rejectsAnInvalidPagingValue(String parameter, String value) throws Exception {
        mockMvc.perform(get("/api/notifications").param(parameter, value))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("INVALID_QUERY"));

        verifyNoInteractions(queryService);
    }
}
