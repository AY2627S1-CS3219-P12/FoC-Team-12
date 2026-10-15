# Order Service

Order owns errand lifecycle facts. Scope and invariants live in [AGENTS.md](AGENTS.md);
the D3 roadmap is [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md).

## Current state

Only documentation and an empty Dockerfile exist. Application code, schema, APIs, tests and
Compose integration are planned. No runnable service or published Order contract exists yet.

## Architecture

Use the stack specified in AGENTS.md with a private PostgreSQL database. Store requester/courier
UUID references, location snapshots, title/description, reward, pickup deadline, state and
transition history. Resolve User identity through the
[User JWT contract](../user-service/README.md#login-and-jwt-verification) and locations through
the [Supplier API](../supplier-service/README.md).

Choose and document the concurrency mechanism before acceptance is implemented. Order records
lifecycle decisions; Credit applies ledger effects. User activation, Order-Credit transport,
service authentication, broker selection, message schemas and reconciliation remain pending
approved contracts under the root rules. A successful local transaction alone does not prove
cross-service completion.

## Lifecycle

| Current | Next | Actor/condition |
| --- | --- | --- |
| OPEN | ACCEPTED | Eligible courier, not the requester |
| OPEN | CANCELLED | Requester |
| OPEN | EXPIRED | Pickup deadline passed |
| ACCEPTED | OPEN | Assigned courier withdraws before deadline |
| ACCEPTED | EXPIRED | Assigned courier withdraws after deadline |
| ACCEPTED | CANCELLED | Requester before pickup; compensate courier through Credit |
| ACCEPTED | PICKED_UP | Assigned courier |
| PICKED_UP | DELIVERED | Assigned courier |
| DELIVERED | COMPLETED | Requester confirms receipt |

COMPLETED, CANCELLED and EXPIRED are terminal. Cancellation is forbidden after pickup.
The approved backlog governs unresolved boundary cases such as the exact deadline instant.

## Verification

After the scaffold implements Maven Wrapper, run from this directory:

```powershell
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```

On Unix use `./mvnw --batch-mode --no-transfer-progress verify`. Focused tests may be used during
iteration; completion requires the affected verification suite. Runtime changes additionally
need the approved Compose startup and health checks. Until scaffold/dependencies exist, report
these checks as unavailable.
