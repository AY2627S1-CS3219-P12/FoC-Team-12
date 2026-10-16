package com.friendoncampus.order.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.test.util.ReflectionTestUtils;

/** Phase 1 state machine: open, failReservation and cancel, including the deadline boundary. */
class OrderTest {

    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 16, 12, 0, 0, 0, ZoneOffset.UTC);
    private static final UUID REQUESTER = UUID.fromString("97947588-bb2e-42f2-91ba-9abf8e15a8e7");
    private static final UUID COURIER = UUID.fromString("5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10");
    private static final UUID RESERVATION = UUID.fromString("0c5d1f7a-3e2b-4c69-8a1d-9f4e6b2c7d35");

    private static Order order(OrderState state, OffsetDateTime deadline) {
        Order order = Order.submit(REQUESTER, "Collect printing", "Grab my printout",
                UUID.randomUUID(), UUID.randomUUID(), 10, deadline);
        ReflectionTestUtils.setField(order, "state", state);
        return order;
    }

    private static Order order(OrderState state) {
        return order(state, NOW.plusHours(2));
    }

    @Test
    void submittedRecordsAReserveRequestFromTheRequester() {
        OrderTransition transition = order(OrderState.PENDING_CREDIT).submitted(NOW);

        assertThat(transition.toState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(transition.actorId()).isEqualTo(REQUESTER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RESERVE);
        assertThat(transition.eventType()).isEqualTo("OrderSubmitted");
    }

    @Test
    void openMovesAPendingOrderToOpenAndStoresTheReservation() {
        Order order = order(OrderState.PENDING_CREDIT);

        OrderTransition transition = order.open(RESERVATION, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
        assertThat(order.getCreditReservationId()).isEqualTo(RESERVATION);
        assertThat(order.getStateChangedAt()).isEqualTo(NOW);
        assertThat(transition.fromState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.SYSTEM);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
        assertThat(transition.eventType()).isEqualTo("OrderOpened");
    }

    @Test
    void openOneMillisecondBeforeTheDeadlineStillOpens() {
        Order order = order(OrderState.PENDING_CREDIT, NOW.plusNanos(1_000_000));

        order.open(RESERVATION, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
    }

    @Test
    void openExactlyAtTheDeadlineExpiresAndReleasesTheReservation() {
        Order order = order(OrderState.PENDING_CREDIT, NOW);

        OrderTransition transition = order.open(RESERVATION, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.EXPIRED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.PICKUP_DEADLINE_PASSED);
        assertThat(order.getExpiredAt()).isEqualTo(NOW);
        assertThat(order.getCreditReservationId()).isEqualTo(RESERVATION);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RELEASE);
        assertThat(transition.eventType()).isEqualTo("OrderExpired");
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "PENDING_CREDIT", mode = EnumSource.Mode.EXCLUDE)
    void openIsRejectedOutsidePendingCredit(OrderState state) {
        Order order = order(state);

        assertThatThrownBy(() -> order.open(RESERVATION, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception -> {
                    assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION);
                    assertThat(exception.getCurrentState()).isEqualTo(state);
                });
        assertThat(order.getState()).isEqualTo(state);
    }

    @Test
    void failReservationEndsAPendingOrder() {
        Order order = order(OrderState.PENDING_CREDIT);

        OrderTransition transition = order.failReservation(NOW);

        assertThat(order.getState()).isEqualTo(OrderState.RESERVATION_FAILED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.CREDIT_RESERVATION_REJECTED);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.NONE);
        assertThat(transition.eventType()).isEqualTo("OrderReservationFailed");
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = "PENDING_CREDIT", mode = EnumSource.Mode.EXCLUDE)
    void failReservationIsRejectedOutsidePendingCredit(OrderState state) {
        Order order = order(state);

        assertThatThrownBy(() -> order.failReservation(NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
        assertThat(order.getState()).isEqualTo(state);
    }

    @Test
    void requesterCancelsAnOpenOrderWithAFullRelease() {
        Order order = order(OrderState.OPEN);

        OrderTransition transition = order.cancel(REQUESTER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.REQUESTER_CANCELLED_OPEN);
        assertThat(order.getCancelledAt()).isEqualTo(NOW);
        assertThat(transition.actorRole()).isEqualTo(ActorRole.REQUESTER);
        assertThat(transition.courierId()).isNull();
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.RELEASE);
    }

    @Test
    void requesterCancelsAnAcceptedOrderClearingTheCourierAndCompensatingThem() {
        Order order = order(OrderState.ACCEPTED);
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        OrderTransition transition = order.cancel(REQUESTER, NOW);

        assertThat(order.getState()).isEqualTo(OrderState.CANCELLED);
        assertThat(order.getCourierId()).isNull();
        assertThat(order.getTerminalReason()).isEqualTo(TerminalReason.REQUESTER_CANCELLED_ACCEPTED);
        assertThat(transition.courierId()).isEqualTo(COURIER);
        assertThat(transition.creditEffect()).isEqualTo(CreditEffect.COMPENSATE);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = {"PICKED_UP", "DELIVERED", "COMPLETED"})
    void cancelIsNeverAllowedOncePickedUp(OrderState state) {
        Order order = order(state);
        ReflectionTestUtils.setField(order, "courierId", COURIER);

        assertThatThrownBy(() -> order.cancel(REQUESTER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.CANCELLATION_NOT_ALLOWED));
        assertThat(order.getState()).isEqualTo(state);
        assertThat(order.getCourierId()).isEqualTo(COURIER);
    }

    @ParameterizedTest
    @EnumSource(value = OrderState.class, names = {"PENDING_CREDIT", "CANCELLED", "EXPIRED", "RESERVATION_FAILED"})
    void cancelIsRejectedInStatesThatAreNotCancellable(OrderState state) {
        Order order = order(state);

        assertThatThrownBy(() -> order.cancel(REQUESTER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.INVALID_STATE_TRANSITION));
    }

    @Test
    void onlyTheRequesterCanCancel() {
        Order order = order(OrderState.OPEN);

        assertThatThrownBy(() -> order.cancel(COURIER, NOW))
                .isInstanceOfSatisfying(OrderTransitionException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(OrderErrorCode.NOT_ORDER_REQUESTER));
        assertThat(order.getState()).isEqualTo(OrderState.OPEN);
    }

    @Test
    void visibilityAllowsAnyoneOnOpenOrdersAndOnlyParticipantsOtherwise() {
        UUID stranger = UUID.randomUUID();
        Order open = order(OrderState.OPEN);
        Order accepted = order(OrderState.ACCEPTED);
        ReflectionTestUtils.setField(accepted, "courierId", COURIER);

        assertThat(open.isVisibleTo(stranger)).isTrue();
        assertThat(accepted.isVisibleTo(stranger)).isFalse();
        assertThat(accepted.isVisibleTo(REQUESTER)).isTrue();
        assertThat(accepted.isVisibleTo(COURIER)).isTrue();
    }
}
