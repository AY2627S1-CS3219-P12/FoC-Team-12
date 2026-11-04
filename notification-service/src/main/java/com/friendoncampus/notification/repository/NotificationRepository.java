package com.friendoncampus.notification.repository;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.friendoncampus.notification.domain.Notification;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    /** The recipient's notifications; callers pass the sort (newest {@code occurredAt} first). */
    Page<Notification> findByRecipientId(UUID recipientId, Pageable pageable);
}
