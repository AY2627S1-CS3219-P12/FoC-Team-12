package com.friendoncampus.notification.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.notification.domain.Notification;
import com.friendoncampus.notification.repository.NotificationRepository;

/**
 * Reads one recipient's notifications. The recipient is always the verified JWT subject, passed in
 * by the controller, so no caller can read another user's rows.
 */
@Service
public class NotificationQueryService {

    /**
     * Newest fact first. {@code occurredAt} rather than {@code createdAt}, so events caught up after
     * downtime still appear in real-time order; the ID breaks ties so pages never overlap.
     */
    private static final Sort NEWEST_FIRST = Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("id"));

    private final NotificationRepository notificationRepository;

    public NotificationQueryService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    @Transactional(readOnly = true)
    public Page<Notification> listFor(UUID recipientId, NotificationPaging paging) {
        return notificationRepository.findByRecipientId(recipientId,
                PageRequest.of(paging.page(), paging.size(), NEWEST_FIRST));
    }
}
