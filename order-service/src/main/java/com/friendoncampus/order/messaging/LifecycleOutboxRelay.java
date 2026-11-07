package com.friendoncampus.order.messaging;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.annotation.Transactional;
import com.friendoncampus.order.repository.LifecycleOutboxEventRepository;

public class LifecycleOutboxRelay {
    private static final Logger log=LoggerFactory.getLogger(LifecycleOutboxRelay.class);
    private final LifecycleOutboxEventRepository repository;private final KafkaTemplate<String,String> kafka;private final Clock clock;
    public LifecycleOutboxRelay(LifecycleOutboxEventRepository repository,KafkaTemplate<String,String> kafka,Clock clock){this.repository=repository;this.kafka=kafka;this.clock=clock;}
    @Transactional public int publishPending(){int published=0;for(var event:repository.claimUnpublished(100)){try{kafka.send(OrderEventRecorder.ORDER_LIFECYCLE_TOPIC,event.getAggregateId().toString(),event.getPayload()).get(10,TimeUnit.SECONDS);event.markPublished(OffsetDateTime.now(clock));published++;}catch(InterruptedException e){Thread.currentThread().interrupt();event.recordFailedAttempt();break;}catch(Exception e){event.recordFailedAttempt();log.warn("Could not publish lifecycle event {} attempt {}",event.getId(),event.getAttempts(),e);break;}}return published;}
}
