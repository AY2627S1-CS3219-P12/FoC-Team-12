# User Service

Owner: Darryl. Own registration/NUS verification, login/JWT/JWKS, reset OTPs, profiles,
roles/RBAC, protected fields and account lifecycle. Existing account-management UI stays here;
new dispute cases/dashboard belong to Darryl's planned `admin-service/` area.

For Admin integration read [Admin spec](../docs/integration/admin-service-spec.md),
[Chat/security contract](../docs/integration/chat-admin-contract.md) and
[sanction commands](../docs/integration/admin-command-contract.md). User owns eligibility/status
checks and the sanction consumer; do not implement Admin cases or Chat storage here.

Publish stable user UUIDs and signed identity/role claims for consumers. Keep admin assignment and
account-state checks on the backend; never expose privileged self-service role changes. Resolve
missing account/token/OTP/admin rules against the approved backlog.

Read the relevant [README](README.md) behavior, JWT contract and verification sections.
