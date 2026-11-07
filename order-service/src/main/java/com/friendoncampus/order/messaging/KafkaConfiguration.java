package com.friendoncampus.order.messaging;

import java.time.Clock;
import java.time.Duration;

import org.apache.kafka.common.TopicPartition;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.backoff.ExponentialBackOff;

import com.friendoncampus.order.repository.OutboxEventRepository;

/**
 * Kafka adapters for the event blueprint: the outbox relay to {@code order.events} and the
 * {@code credit.events} listener. Topics and ACLs are created by the shared Kafka initializer, not
 * here. Turned off with {@code ORDER_KAFKA_ENABLED=false}; outbox rows then wait unpublished.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true", matchIfMissing = true)
public class KafkaConfiguration {

    public static final String CREDIT_EVENTS_TOPIC = "credit.events";
    static final String CREDIT_EVENTS_DLT = "credit.events.DLT";

    @Bean
    OutboxRelay outboxRelay(OutboxEventRepository outboxEventRepository, KafkaTemplate<String, String> kafkaTemplate,
            Clock clock,
            @Value("${app.kafka.outbox.batch-size:100}") int batchSize,
            @Value("${app.kafka.outbox.send-timeout-ms:10000}") long sendTimeoutMs) {
        return new OutboxRelay(outboxEventRepository, kafkaTemplate, clock, batchSize,
                Duration.ofMillis(sendTimeoutMs));
    }

    @Bean
    OutboxRelaySchedule outboxRelaySchedule(OutboxRelay relay) {
        return new OutboxRelaySchedule(relay);
    }

    @Bean
    CreditEventsListener creditEventsListener(CreditOutcomeHandler handler) {
        return new CreditEventsListener(handler);
    }

    /**
     * Manual acknowledgement after the handler commits. Transient failures are retried three times
     * with backoff; contract violations are not retried. Either way the original record (key and
     * headers kept) then goes to {@code credit.events.DLT}, which has one partition.
     */
    @Bean
    ConcurrentKafkaListenerContainerFactory<String, String> creditEventsContainerFactory(
            ConsumerFactory<String, String> consumerFactory, KafkaTemplate<String, String> kafkaTemplate) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(kafkaTemplate,
                (record, exception) -> new TopicPartition(CREDIT_EVENTS_DLT, 0));
        ExponentialBackOff backOff = new ExponentialBackOff(500L, 2.0);
        backOff.setMaxAttempts(3);
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);
        errorHandler.addNotRetryableExceptions(CreditOutcomeRejectedException.class);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }

    /** Runs the relay on a timer. */
    static class OutboxRelaySchedule {

        private final OutboxRelay relay;

        OutboxRelaySchedule(OutboxRelay relay) {
            this.relay = relay;
        }

        @Scheduled(fixedDelayString = "${app.kafka.outbox.interval-ms:1000}")
        void run() {
            relay.publishPending();
        }
    }
}
