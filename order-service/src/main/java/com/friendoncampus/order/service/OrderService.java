package com.friendoncampus.order.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.order.domain.Order;
import com.friendoncampus.order.repository.OrderRepository;

@Service
public class OrderService {

    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    /**
     * Persists a new order in PENDING_CREDIT. Publishing {@code OrderSubmitted}
     * for Credit Service is a follow-up iteration once the broker is available.
     */
    @Transactional
    public Order createOrder(CreateOrderCommand command) {
        Order order = Order.submit(
                command.requesterId(),
                command.title(),
                command.description(),
                command.pickupLocationId(),
                command.dropoffLocationId(),
                command.creditReward(),
                command.pickupDeadline());
        return orderRepository.save(order);
    }
}
