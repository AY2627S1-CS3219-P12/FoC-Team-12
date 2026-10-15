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

## Persistence model

PostgreSQL is used because reservations and transfers require atomic multi-row updates, row-level
locking, uniqueness constraints and durable history. `credit_accounts` stores available and
reserved integer balances by User UUID. `credit_reservations` stores one order-linked hold.
`credit_operations` makes externally supplied operation UUIDs durable, and
`credit_ledger_entries` records immutable available/reserved deltas and resulting balances.

`totalBalance = availableBalance + reservedBalance` is derived rather than independently stored.
Only initial allocation increases the closed economy; reserve, release, settlement and
compensation move existing credits. User and Order UUIDs are cross-service identifiers rather than
foreign keys to another service's database.

## Initial allocation

The configured team policy grants 10 credits once per activated User UUID. The transport-neutral
`InitialCreditAllocationService` accepts a durable operation UUID, creates the account if needed,
locks it, records the allocation operation and writes an immutable ledger entry in one transaction.
Replaying the same operation returns the existing balance; a different operation for an already
allocated user records `ALREADY_ALLOCATED` without increasing the economy. User activation event
consumption remains pending the User-owned contract and broker integration.

## Reservation lifecycle

Transport-neutral operations reserve a positive whole-credit reward by locking the requester's
account, moving the amount from available to reserved, creating one reservation per Order UUID and
writing the operation plus ledger entry in one transaction. Reward increases reserve only the
difference when affordable; decreases release the difference. Cancellation or expiry releases the
entire active reservation. Replayed operation UUIDs return the persisted outcome, while reuse with
different inputs is rejected as an idempotency conflict.

## Settlement and compensation

An active reservation is settled atomically by removing the full reserved amount from the
requester and crediting it to the assigned courier. A compensation-required cancellation instead
transfers `ceil(reserved * 20 / 100)` and releases the remainder to the requester. The reservation,
both account balances, durable operation and two-sided ledger entries commit in one transaction.
Account rows are locked in UUID order to reduce deadlock risk; retries are idempotent and a settled
reservation cannot be settled through a different outcome.

## Verification

From this directory:

```powershell
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```

On Unix use `./mvnw --batch-mode --no-transfer-progress verify`. Focused tests may be used during
iteration; completion requires the affected verification suite. Runtime changes additionally
need the approved database startup and health checks.
