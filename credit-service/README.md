# Credit Service

Credit owns accounts, reservations and ledger effects. Scope and invariants live in
[AGENTS.md](AGENTS.md); the D3 roadmap is [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md).

## Current state

The Spring Boot foundation runs on port `8083` with PostgreSQL/Flyway configuration, User Service
RS256/JWKS validation, Actuator health, OpenAPI and a non-root multi-stage Docker image. The shared
Compose stack and gateway expose the packaged dashboard and query API. Broker integration remains
coordinated follow-up work.

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

## User query API

An authenticated user can call `GET /api/credits/me` for their balance and
`GET /api/credits/me/transactions?page=0&size=20` for immutable ledger history. The account UUID is
taken only from the validated User Service JWT subject, so callers cannot select another user's
account. All roles issued by the agreed User JWT contract may view their own data. Mutation routes
remain closed until service-caller authentication and the User/Order integration contracts are
approved.

## Credit dashboard

The responsive React dashboard is packaged inside the service and served at `/credits`, with
collision-free production assets under `/credit-assets/**`. It reuses the validated
`sessionStorage["foc.user-session"]` established by the User frontend on the shared gateway origin,
adds the bearer token to the two user query endpoints, and never accepts a selectable account ID.
It presents available, reserved and total balances plus paginated immutable ledger history. Signed
out, loading, pending-account, expired-session, empty-history and unavailable-service states are
handled explicitly.

Frontend development runs on port `5175` and proxies `/api` to the Credit Service:

```sh
cd frontend
npm ci
npm run dev
```

The packaged shared-origin experience requires the approved Gateway route described in the root
deployment documentation; direct frontend development does not share session storage with port
`8088`.

## Opt-in demo scenario

For an assessor demo before User and Order publish their Kafka events, the `demo` Spring profile can
prepare one deterministic local scenario. It grants the configured registered user the normal 10
initial credits and reserves 3, producing visible balance and ledger history. The identifiers are
stable, so restarting does not duplicate credits or reservations. This fixture calls the same domain
services as future event consumers; it does not add an unsecured mutation API.

Set these values in the root `.env`, then rebuild `credit-service`:

```text
CREDIT_SPRING_PROFILES_ACTIVE=demo
CREDIT_DEMO_USER_ID=<UUID from the registered User account>
```

Leave both values blank for normal operation. The fixture is disabled unless the `demo` profile is
explicitly active. It is presentation scaffolding, not a replacement for the pending Kafka
integration.

## Verification

From this directory:

```powershell
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```

On Unix use `./mvnw --batch-mode --no-transfer-progress verify`. Focused tests may be used during
iteration; completion requires the affected verification suite. Runtime changes additionally
need the approved database startup and health checks.

From `frontend`, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` for the UI
completion checks.
