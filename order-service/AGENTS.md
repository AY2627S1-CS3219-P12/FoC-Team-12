# Order Service

Owner: XueTing. Own errand APIs, lifecycle/history, expiry, discovery, concurrency and Order
events; also Notifications. Credit owns all ledger effects, Supplier owns location master data,
and User owns identity.

## Invariants

- Authorize actions using the verified User JWT subject/effective role and the actor's relationship
  to the order. Reject self-acceptance; only the assigned courier withdraws/picks up/delivers,
  and only the requester edits/cancels/confirms receipt where the lifecycle permits.
- Apply the [README lifecycle](README.md#lifecycle) atomically. Acceptance, cancellation and expiry
  must have one winner; safe retries must not repeat transitions, events or credit effects.
- Expire only OPEN orders after their pickup deadline. Withdrawal after the deadline expires
  rather than reopens the order. Reject invalid actions without mutation.
- Require positive whole-credit rewards, distinct pickup/drop-off locations and approved field
  limits. Capture Supplier-provided location snapshots so later edits/deletion do not rewrite
  existing errands.
- Publish lifecycle facts; request ledger effects only through approved Credit contracts.

## Implementation

Use Java 17, Spring Boot, Maven Wrapper, PostgreSQL, JPA transactions, Flyway, validation,
Actuator, OpenAPI and User-contract RS256/JWKS validation. Never edit applied migrations.
Read [README](README.md) architecture/verification sections as needed and the relevant
[checklist](IMPLEMENTATION_CHECKLIST.md) item when scoping D3 work.
