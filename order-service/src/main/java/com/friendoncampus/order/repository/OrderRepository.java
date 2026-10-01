package com.friendoncampus.order.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.friendoncampus.order.domain.Order;

public interface OrderRepository extends JpaRepository<Order, UUID> {
}
