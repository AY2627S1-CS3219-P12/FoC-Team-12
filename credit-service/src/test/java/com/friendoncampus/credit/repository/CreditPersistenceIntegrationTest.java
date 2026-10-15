package com.friendoncampus.credit.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.friendoncampus.credit.domain.CreditAccount;

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

    @Test
    void flywaySchemaMatchesJpaAndPersistsAnAccount() {
        UUID userId = UUID.randomUUID();

        accounts.saveAndFlush(CreditAccount.empty(userId));

        CreditAccount stored = accounts.findById(userId).orElseThrow();
        assertThat(stored.getAvailableBalance()).isZero();
        assertThat(stored.getReservedBalance()).isZero();
        assertThat(stored.getCreatedAt()).isNotNull();
    }
}
