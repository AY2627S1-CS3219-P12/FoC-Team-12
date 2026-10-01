package com.friendoncampus.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.domain.OrderState;
import com.friendoncampus.order.repository.OrderRepository;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @InjectMocks
    private OrderService orderService;

    @Test
    void createOrderPersistsPendingCreditOrderWithCommandFields() {
        UUID requesterId = UUID.randomUUID();
        UUID pickup = UUID.randomUUID();
        UUID dropoff = UUID.randomUUID();
        OffsetDateTime deadline = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1);
        CreateOrderCommand command = new CreateOrderCommand(
                requesterId, "Collect printing", "Grab my printout", pickup, dropoff, 10, deadline);
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Order saved = orderService.createOrder(command);

        ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
        org.mockito.Mockito.verify(orderRepository).save(captor.capture());
        Order persisted = captor.getValue();
        assertThat(persisted.getState()).isEqualTo(OrderState.PENDING_CREDIT);
        assertThat(persisted.getRequesterId()).isEqualTo(requesterId);
        assertThat(persisted.getPickupLocationId()).isEqualTo(pickup);
        assertThat(persisted.getDropoffLocationId()).isEqualTo(dropoff);
        assertThat(persisted.getCreditReward()).isEqualTo(10);
        assertThat(persisted.getPickupDeadline()).isEqualTo(deadline);
        assertThat(saved).isSameAs(persisted);
    }
}
