package com.friendoncampus.credit.integration;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditInboxEvent;
import com.friendoncampus.credit.domain.InboxEventStatus;
import com.friendoncampus.credit.repository.CreditInboxEventRepository;

@Service
public class CreditInboxProcessingService {

    private final CreditInboxEventRepository inbox;

    public CreditInboxProcessingService(CreditInboxEventRepository inbox) {
        this.inbox = inbox;
    }

    @Transactional
    public boolean process(UUID eventId, Runnable handler) {
        CreditInboxEvent event = inbox.findByEventIdForUpdate(eventId)
                .orElseThrow(() -> new IllegalStateException("Inbox event is missing"));
        if (event.getStatus() == InboxEventStatus.PROCESSED) {
            return false;
        }
        handler.run();
        event.markProcessed();
        inbox.save(event);
        return true;
    }
}
