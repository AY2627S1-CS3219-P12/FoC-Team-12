package com.friendoncampus.notification.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.domain.NotificationType;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    /** The recipient's notifications; callers pass the sort (newest {@code occurredAt} first). */
    Page<Notification> findByRecipientId(UUID recipientId, Pageable pageable);

    /** The notification already created for this recipient, type and source business operation. */
    Optional<Notification> findByRecipientIdAndTypeAndBusinessKey(UUID recipientId, NotificationType type,
            String businessKey);
}
