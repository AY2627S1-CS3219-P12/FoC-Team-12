# Admin Service

Owner: Darryl. Own the private case database, reviewer permissions and dashboard.
Follow root guidance and docs/integration/admin-service-spec.md. User owns current
account eligibility; Chat owns evidence and conversations. Never read their databases.
Cases own reporting, private status, administrator review/claims, evidence adapters/recovery
exports and atomic audit/outbox. Chat owns the historical timeline projection and coverage.
Do not fabricate Chat eligibility/evidence or implement financial/sanction actions here.
Shared gateway, deployment and CI changes require a separately nominated editor.
