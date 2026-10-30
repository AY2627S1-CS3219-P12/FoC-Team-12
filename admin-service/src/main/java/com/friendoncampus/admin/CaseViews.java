package com.friendoncampus.admin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CaseViews {
    private CaseViews() { }
    public record Summary(UUID caseId, UUID orderId, AdminCase.State state, UUID reviewerId, long revision, Instant createdAt) { }
    public record Statement(UUID reporterId, String description, Instant submittedAt) { }
    public record ParticipantReport(Summary caseSummary, Statement ownStatement) {
        @com.fasterxml.jackson.annotation.JsonProperty("case")
        public Summary caseSummary() { return caseSummary; }
    }
    public record Detail(Summary caseSummary, List<Statement> statements, List<CreditActionService.Action> actions, String resolution) {
        @com.fasterxml.jackson.annotation.JsonProperty("case")
        public Summary caseSummary() { return caseSummary; }
    }
    public record Page(List<Summary> content, int page, int size, long totalElements, int totalPages) { }
    public record Mutation(int status, String body) { }
}
