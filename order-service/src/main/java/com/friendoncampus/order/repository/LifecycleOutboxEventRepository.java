package com.friendoncampus.order.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.friendoncampus.order.messaging.LifecycleOutboxEvent;

public interface LifecycleOutboxEventRepository extends JpaRepository<LifecycleOutboxEvent,UUID>{
    @Query(value="select coalesce(max(source_sequence),0)+1 from lifecycle_outbox_events where aggregate_id=:aggregateId",nativeQuery=true)
    long nextSourceSequence(@Param("aggregateId") UUID aggregateId);

    @Query(value="select * from lifecycle_outbox_events where published_at is null order by created_at,id limit :limit for update skip locked",nativeQuery=true)
    List<LifecycleOutboxEvent> claimUnpublished(@Param("limit") int limit);
}
