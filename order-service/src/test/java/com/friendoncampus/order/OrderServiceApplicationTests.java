package com.friendoncampus.order;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.order.repository.OrderRepository;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
        "order.security.jwt.secret=test-secret-please-change-0123456789abcdef"
})
class OrderServiceApplicationTests {

    @MockitoBean
    private OrderRepository orderRepository;

    @Test
    void contextLoads() {
    }
}
