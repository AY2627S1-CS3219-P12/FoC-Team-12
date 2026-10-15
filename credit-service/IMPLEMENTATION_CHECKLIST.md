# Credit Service D3 implementation checklist

Use this tracked checklist with `$foc-iterate-feature`; it is not a substitute for an approved
feature brief. Complete one numbered outcome at a time.

## 1. Service foundation

- Create the Java 17 Spring Boot/Gradle-or-Maven project following the established repository
  backend conventions, with PostgreSQL, Flyway, validation, Actuator, OpenAPI, and test setup.
- Add a private Credit database, forward-only initial migration, health endpoint, documented local
  run instructions, and a passing backend verification command.
- Add User Service JWKS-based JWT validation using the existing issuer/audience/role contract.
  Do not issue tokens or access the User database.

Acceptance: a clean checkout can build/test the service, start against its private database, and
report health; direct unauthorized credit mutation is rejected.

## 2. Local account and ledger invariants

- Agree and document the local account, reservation, and immutable ledger schema before
  publishing mutation APIs/events.
- Implement atomic reserve, release, reward adjustment, and settlement operations with an
  operation-level idempotency key.
- Enforce positive whole-credit amounts, order-linked reservations, non-negative available
  balance, and durable transaction history under concurrent requests.

Acceptance: tests cover insufficient funds, duplicate operation, concurrent reserve attempts,
release, full completion transfer, 20%-rounded-up cancellation compensation, and restart
durability.

## 3. Approved User and Order integration

- Obtain a User-owned activation/allocation contract before creating accounts from User events or
  callbacks. It must guarantee at-most-once allocation even when delivery retries.
- Obtain an Order-owned reservation/settlement/release contract before acting on lifecycle facts.
  It must identify the idempotency key, exact amount, authorised caller, terminal result, failure
  and reconciliation owner.
- Implement a meaningful asynchronous workflow only after its persisted event/message, duplicate
  detection, failure record, retry policy, ordering needs, and observability are agreed.

Acceptance: demonstrate user activation to one allocation, order reservation, settlement or
release, balances before/after, and retry/duplicate/failure handling.

## 4. Shared deployment and N2H

- Coordinate gateway, Compose, CI, messaging, and environment changes as shared work; do not add
  unapproved routes, secrets, or broker infrastructure.
- Keep Chat/Translation in independently approved iterations with its own privacy, retention, and
  authorization decisions. It must not delay or weaken ledger correctness.
