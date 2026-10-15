# Credit Service

Credit owns accounts, reservations and ledger effects. Scope and invariants live in
[AGENTS.md](AGENTS.md); the D3 roadmap is [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md).

## Current state

The Spring Boot foundation runs on port `8083` with PostgreSQL/Flyway configuration, User Service
RS256/JWKS validation, Actuator health, OpenAPI and a non-root multi-stage Docker image. Credit
domain operations and APIs are added in the following bounded iterations. Shared Compose, gateway,
CI and broker integration remain coordinated follow-up work.

## Architecture

Use the stack specified in AGENTS.md with a private PostgreSQL database. Represent accounts by
User UUID, order-linked reservations and immutable operation records. Keep available/reserved
values consistent with those records using atomic transactions and durable operation identities.

Use the [User JWT contract](../user-service/README.md#login-and-jwt-verification) for user-facing
authentication. Integration caller authentication still needs its own approved contract: a
student bearer token alone must not authorize internal ledger mutations.

The User activation/allocation contract and Order reservation, reward-adjustment, release and
settlement contracts remain to be agreed. Define transport, allowed callers, duplicate/conflicting
requests and recovery ownership under root rules before integrating. Credit applies financial
effects of Order decisions; it does not infer lifecycle transitions.

Retain authoritative ledger history locally. The backlog's user-visible transfer history depends
on Logging-owned retrieval; agree that integration before exposing it. Chat/Translation needs
separate approved privacy, retention and participant-authorization decisions.

## Verification

From this directory:

```powershell
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```

On Unix use `./mvnw --batch-mode --no-transfer-progress verify`. Focused tests may be used during
iteration; completion requires the affected verification suite. Runtime changes additionally
need the approved database startup and health checks.
