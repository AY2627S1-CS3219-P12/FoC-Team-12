# Order Service D3 implementation checklist

Use this tracked checklist with `$foc-iterate-feature`; it is not a substitute for an approved
feature brief. Complete one numbered outcome at a time.

## 1. Service foundation

- Create the Java 17 Spring Boot/Gradle-or-Maven project following the established repository
  backend conventions, with PostgreSQL, Flyway, validation, Actuator, OpenAPI, and test setup.
- Add a private Order database, forward-only initial migration, health endpoint, documented local
  run instructions, and a passing backend verification command.
- Add User Service JWKS-based JWT validation using the existing issuer/audience/role contract.
  Do not duplicate token issuing or store user credentials.

Acceptance: a clean checkout can build/test the service, start against its private database, and
report health; missing/invalid tokens are rejected on protected endpoints.

## 2. Local order model and API

- Agree and document the Order API before publishing it: resource fields, validation limits,
  lifecycle responses, pagination/filtering/sorting, Problem Details, and OpenAPI.
- Implement request creation, OPEN-only editing, requester cancellation, open-list discovery,
  order detail, and requester/courier history using only locally owned data.
- Capture the required supplier/location details at creation through an approved Supplier lookup;
  do not join another service database.

Acceptance: tests cover valid and invalid input, requester ownership, self-acceptance rejection,
and no mutation on invalid requests.

## 3. Lifecycle safety

- Implement acceptance, courier withdrawal, pickup, delivery, completion, and OPEN expiry against
  the approved state table.
- Prove with automated concurrency tests that acceptance, cancellation, and expiry cannot all win.
- Add transition idempotency and record enough transition history/operation identity to prevent
  duplicate Order events or Credit requests.

Acceptance: tests cover competing acceptance, acceptance-versus-expiry, duplicate transition,
withdrawal after deadline, invalid transition, and unauthorized actor cases.

## 4. Approved integration and D3 evidence

- Jointly publish the Order-Credit contract before implementation. Include operation/event ID,
  caller authentication, exact inputs/outputs, duplicate behavior, failure/retry policy, and the
  reconciliation owner.
- Implement one meaningful asynchronous workflow only after its producer/consumer schema,
  duplicate handling, ordering, persistence-before-publish strategy, failure record, and
  observability are approved.
- Coordinate gateway, Compose, CI, and environment changes as shared work; do not add routes or
  services speculatively.

Acceptance: demonstrate authenticated create/accept/complete or cancellation flow, resulting
Credit effect, duplicate/failure handling, and container health once the shared stack is approved.
