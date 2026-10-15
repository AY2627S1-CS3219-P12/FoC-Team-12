package com.friendoncampus.credit.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.domain.InboxEventStatus;
import com.friendoncampus.credit.integration.CreditEventCoordinator;
import com.friendoncampus.credit.integration.CreditEventEnvelope;
import com.friendoncampus.credit.integration.CreditOutboxService;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class CreditPersistenceIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private CreditAccountRepository accounts;

    @Autowired
    private CreditInboxEventRepository inbox;

    @Autowired
    private CreditOutboxEventRepository outbox;

    @Autowired
    private CreditEventCoordinator eventCoordinator;

    @Autowired
    private CreditOutboxService outboxService;

    @Test
    void flywaySchemaMatchesJpaAndPersistsAnAccount() {
        UUID userId = UUID.randomUUID();

        accounts.saveAndFlush(CreditAccount.empty(userId));

        CreditAccount stored = accounts.findById(userId).orElseThrow();
        assertThat(stored.getAvailableBalance()).isZero();
        assertThat(stored.getReservedBalance()).isZero();
        assertThat(stored.getCreatedAt()).isNotNull();
    }

    @Test
    void inboxPersistsProcessingOutcomeAndSuppressesDuplicateDelivery() {
        CreditEventEnvelope event = event("OrderSubmitted", "order-service");
        AtomicInteger handlerCalls = new AtomicInteger();

        assertThat(eventCoordinator.process(event, handlerCalls::incrementAndGet))
                .isEqualTo(CreditEventCoordinator.ProcessingOutcome.PROCESSED);
        assertThat(eventCoordinator.process(event, handlerCalls::incrementAndGet))
                .isEqualTo(CreditEventCoordinator.ProcessingOutcome.DUPLICATE);

        assertThat(handlerCalls).hasValue(1);
        assertThat(inbox.findById(event.eventId()).orElseThrow().getStatus())
                .isEqualTo(InboxEventStatus.PROCESSED);
    }

    @Test
    void outboxKeepsAnEventPendingUntilPublishingIsAcknowledged() {
        CreditEventEnvelope event = event("CreditReserved", CreditOutboxService.CREDIT_PRODUCER);

        outboxService.enqueue(event);

        assertThat(outboxService.pending(10)).extracting(item -> item.getEventId())
                .contains(event.eventId());
        outboxService.markPublished(event.eventId());
        assertThat(outbox.findById(event.eventId()).orElseThrow().getPublishedAt()).isNotNull();
        assertThat(outboxService.pending(10)).extracting(item -> item.getEventId())
                .doesNotContain(event.eventId());
    }

    @Test
    void failedInboxEventRemainsRecoverableAndCanSucceedOnRetry() {
        CreditEventEnvelope event = event("OrderSubmitted", "order-service");

        assertThatThrownBy(() -> eventCoordinator.process(event, () -> {
            throw new IllegalStateException("temporary failure");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(inbox.findById(event.eventId()).orElseThrow())
                .satisfies(stored -> {
                    assertThat(stored.getStatus()).isEqualTo(InboxEventStatus.FAILED);
                    assertThat(stored.getAttemptCount()).isEqualTo(1);
                    assertThat(stored.getLastError()).isEqualTo("temporary failure");
                });

        assertThat(eventCoordinator.process(event, () -> { }))
                .isEqualTo(CreditEventCoordinator.ProcessingOutcome.PROCESSED);
        assertThat(inbox.findById(event.eventId()).orElseThrow())
                .satisfies(stored -> {
                    assertThat(stored.getStatus()).isEqualTo(InboxEventStatus.PROCESSED);
                    assertThat(stored.getAttemptCount()).isEqualTo(2);
                    assertThat(stored.getLastError()).isNull();
                });
    }

    private static CreditEventEnvelope event(String eventType, String producer) {
        return new CreditEventEnvelope(
                UUID.randomUUID(),
                eventType,
                1,
                "Order",
                UUID.randomUUID(),
                0,
                OffsetDateTime.parse("2026-10-15T14:00:00Z"),
                producer,
                UUID.randomUUID(),
                null,
                "{\"type\":\"SYSTEM\"}",
                "{\"creditAmount\":3}");
    }
}
