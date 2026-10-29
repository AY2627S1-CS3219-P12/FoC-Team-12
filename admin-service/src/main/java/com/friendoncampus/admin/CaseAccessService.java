package com.friendoncampus.admin;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CaseAccessService {
    private final AdminCaseRepository cases;
    private final UserEligibilityClient users;
    public CaseAccessService(AdminCaseRepository cases, UserEligibilityClient users) { this.cases = cases; this.users = users; }

    // Verify User first, then read current case state. Never hold a case lock across HTTP
    // or reuse a case snapshot obtained before the potentially slow eligibility request.
    public Access check(UUID caseId, UUID actorId, UUID participantId) {
        var actor = users.find(actorId);
        if (!actor.active()) throw hidden();
        AdminCase c = cases.findWithParticipantsById(caseId).orElseThrow(CaseAccessService::hidden);
        boolean admin = actor.administrator();
        boolean target = participantId != null && c.getParticipants().contains(participantId);
        boolean own = target && actorId.equals(participantId);
        if (!admin && (!own || !c.getParticipants().contains(actorId))) throw hidden();
        if (participantId != null && !target) throw hidden();
        boolean readConversation = target && (admin || own);
        boolean write = c.getState() == AdminCase.State.UNDER_REVIEW && readConversation
                && (own || (admin && actorId.equals(c.getReviewerId())));
        List<UUID> visibleParticipants = admin ? c.getParticipants().stream().sorted().toList() : List.of(actorId);
        return new Access(caseId, c.getOrderId(), c.getState(), c.getReviewerId(), visibleParticipants, admin, readConversation, write);
    }
    private static ResponseStatusException hidden() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found"); }
    public record Access(UUID caseId, UUID orderId, AdminCase.State state, UUID reviewerId,
            List<UUID> allowedParticipantIds, boolean canReadEvidence, boolean canReadConversation, boolean canWriteConversation) { }
}
