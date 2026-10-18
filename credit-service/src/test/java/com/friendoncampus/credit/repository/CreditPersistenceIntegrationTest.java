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
import com.friendoncampus.credit.integration.CreditEventHandler;
import com.friendoncampus.credit.integration.CreditOutboxService;
import com.friendoncampus.credit.integration.EventVersionConflictException;
import com.friendoncampus.credit.service.CreditReservationService;
import com.friendoncampus.credit.service.InitialCreditAllocationService;

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

    @Autowired
    private CreditEventHandler eventHandler;

    @Autowired
    private InitialCreditAllocationService allocationService;

    @Autowired
    private CreditReservationService reservationService;

    @Autowired
    private CreditReservationRepository reservations;

    @Autowired
    private CreditOperationRepository operations;

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

    @Test
    void orderEventCommitsReservationInboxAndOutcomeAtomically() {
        UUID userId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        allocationService.allocate(UUID.randomUUID(), userId);
        CreditEventEnvelope event = orderSubmittedEvent(operationId, orderId, userId, 3);

        assertThat(eventHandler.handle(event))
                .isEqualTo(CreditEventCoordinator.ProcessingOutcome.PROCESSED);

        assertThat(reservations.findByOrderId(orderId)).isPresent()
                .get().satisfies(reservation -> assertThat(reservation.getAmount()).isEqualTo(3));
        assertThat(operations.findById(operationId)).isPresent();
        assertThat(inbox.findById(event.eventId())).isPresent()
                .get().extracting(stored -> stored.getStatus()).isEqualTo(InboxEventStatus.PROCESSED);
        assertThat(outboxService.pending(100)).anySatisfy(outcome -> {
            assertThat(outcome.getEventType()).isEqualTo("CreditReserved");
            assertThat(outcome.getCausationId()).isEqualTo(event.eventId());
            assertThat(outcome.getAggregateVersion()).isEqualTo(event.aggregateVersion());
            assertThat(outcome.getPayloadJson()).contains(operationId.toString(), orderId.toString());
        });
    }

    @Test
    void insufficientCreditsCommitsProcessedInboxAndRejectionWithoutLedgerEffect() {
        UUID userId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        allocationService.allocate(UUID.randomUUID(), userId);
        CreditEventEnvelope event = orderSubmittedEvent(operationId, orderId, userId, 11);

        assertThat(eventHandler.handle(event))
                .isEqualTo(CreditEventCoordinator.ProcessingOutcome.PROCESSED);
        CreditEventEnvelope replayWithNewEventId = orderSubmittedEvent(operationId, orderId, userId, 11);
        assertThatThrownBy(() -> eventHandler.handle(replayWithNewEventId))
                .isInstanceOf(EventVersionConflictException.class);

        assertThat(reservations.findByOrderId(orderId)).isEmpty();
        assertThat(operations.findById(operationId)).isPresent().get().satisfies(operation ->
                assertThat(operation.getResultCode()).isEqualTo("INSUFFICIENT_CREDITS"));
        assertThat(accounts.findById(userId)).isPresent().get().satisfies(account -> {
            assertThat(account.getAvailableBalance()).isEqualTo(10);
            assertThat(account.getReservedBalance()).isZero();
        });
        assertThat(inbox.findById(event.eventId())).isPresent()
                .get().extracting(stored -> stored.getStatus()).isEqualTo(InboxEventStatus.PROCESSED);
        assertThat(outboxService.pending(100)).anySatisfy(outcome -> {
            assertThat(outcome.getEventType()).isEqualTo("CreditReservationRejected");
            assertThat(outcome.getCausationId()).isEqualTo(event.eventId());
            assertThat(outcome.getPayloadJson()).contains("INSUFFICIENT_CREDITS");
        });
        assertThat(outboxService.pending(100))
                .noneSatisfy(outcome -> assertThat(outcome.getCausationId()).isEqualTo(replayWithNewEventId.eventId()));
    }

    @Test
    void unexpectedFailureRollsBackDomainAndOutboxButLeavesInboxRetryable() {
        UUID userId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID operationId = UUID.randomUUID();
        allocationService.allocate(UUID.randomUUID(), userId);
        CreditEventEnvelope event = orderSubmittedEvent(operationId, orderId, userId, 3);

        assertThatThrownBy(() -> eventCoordinator.process(event, () -> {
            reservationService.reserve(operationId, orderId, userId, 3);
            throw new IllegalStateException("publisher preparation failed");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(reservations.findByOrderId(orderId)).isEmpty();
        assertThat(operations.findById(operationId)).isEmpty();
        assertThat(accounts.findById(userId)).isPresent().get().satisfies(account -> {
            assertThat(account.getAvailableBalance()).isEqualTo(10);
            assertThat(account.getReservedBalance()).isZero();
        });
        assertThat(inbox.findById(event.eventId())).isPresent().get().satisfies(stored -> {
            assertThat(stored.getStatus()).isEqualTo(InboxEventStatus.FAILED);
            assertThat(stored.getLastError()).isEqualTo("publisher preparation failed");
        });
        assertThat(outboxService.pending(100))
                .noneSatisfy(outcome -> assertThat(outcome.getCausationId()).isEqualTo(event.eventId()));
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

    private static CreditEventEnvelope orderSubmittedEvent(
            UUID operationId,
            UUID orderId,
            UUID requesterId,
            int reward) {
        return new CreditEventEnvelope(
                UUID.randomUUID(),
                "OrderSubmitted",
                1,
                "Order",
                orderId,
                1,
                OffsetDateTime.parse("2026-10-15T14:00:00Z"),
                "order-service",
                UUID.randomUUID(),
                null,
                "{\"type\":\"USER\"}",
                """
                {"operationId":"%s","orderId":"%s","requesterId":"%s","creditReward":%d}
                """.formatted(operationId, orderId, requesterId, reward));
    }
}
