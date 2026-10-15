package com.friendoncampus.credit;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditInboxEventRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;
import com.friendoncampus.credit.repository.CreditOperationRepository;
import com.friendoncampus.credit.repository.CreditOutboxEventRepository;
import com.friendoncampus.credit.repository.CreditReservationRepository;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration"
})
class CreditServiceApplicationTests {

    @MockitoBean CreditAccountRepository accounts;
    @MockitoBean CreditReservationRepository reservations;
    @MockitoBean CreditOperationRepository operations;
    @MockitoBean CreditLedgerEntryRepository ledger;
    @MockitoBean CreditInboxEventRepository inbox;
    @MockitoBean CreditOutboxEventRepository outbox;

    @Test
    void contextLoads() {
    }
}
