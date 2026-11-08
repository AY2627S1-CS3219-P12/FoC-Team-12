package com.friendoncampus.chat.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Revalidates mutable Admin case permissions before every case-chat write. */
@Service
public class CaseConversationAccessGuard {
    private final JdbcClient db;
    private final Clock clock;
    private final InternalServiceClient internalServices;

    public CaseConversationAccessGuard(JdbcClient db, Clock clock, InternalServiceClient internalServices) {
        this.db = db;
        this.clock = clock;
        this.internalServices = internalServices;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean refresh(UUID conversationId, UUID actorId) {
        CaseConversation conversation = db.sql("""
                SELECT case_id,case_participant_id,status
                FROM chat_conversations
                WHERE id=:id AND conversation_type='CASE'
                """).param("id", conversationId)
                .query((rs, n) -> new CaseConversation(
                        rs.getObject("case_id", UUID.class),
                        rs.getObject("case_participant_id", UUID.class),
                        rs.getString("status")))
                .optional().orElse(null);
        if (conversation == null) return true;
        if ("READ_ONLY".equals(conversation.status())) return false;

        boolean writable = internalServices.caseAccess(
                conversation.caseId(), actorId, conversation.participantId())
                .path("canWriteConversation").asBoolean(false);
        if (writable) return true;

        OffsetDateTime lockedAt = OffsetDateTime.now(clock);
        db.sql("UPDATE chat_conversations SET status='READ_ONLY',locked_at=:at,updated_at=:at WHERE id=:id")
                .param("at", lockedAt).param("id", conversationId).update();
        db.sql("UPDATE chat_participants SET can_write=false,valid_until=COALESCE(valid_until,:at) WHERE conversation_id=:id")
                .param("at", lockedAt).param("id", conversationId).update();
        return false;
    }

    private record CaseConversation(UUID caseId, UUID participantId, String status) {}
}
