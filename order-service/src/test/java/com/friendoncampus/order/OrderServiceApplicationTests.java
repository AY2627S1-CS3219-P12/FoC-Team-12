package com.friendoncampus.order;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.order.repository.OrderRepository;
import com.friendoncampus.order.repository.OrderTransitionRepository;
import com.friendoncampus.order.repository.OutboxEventRepository;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
                "app.orders.expiry.enabled=false"
})
class OrderServiceApplicationTests {

    @MockitoBean
    private OrderRepository orderRepository;

    @MockitoBean
    private OrderTransitionRepository orderTransitionRepository;

    @MockitoBean
    private OutboxEventRepository outboxEventRepository;

    @Test
    void contextLoads() {
    }
}
