# Order Service

Owned by XueTing. This service is the D3 source of truth for errand lifecycle facts. Read
[`AGENTS.md`](AGENTS.md), [`IMPLEMENTATION_CHECKLIST.md`](IMPLEMENTATION_CHECKLIST.md), and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) before implementation.

## Current state

This folder is deliberately a D3 implementation starting point: the Order application, database
schema, API contract, tests, and Compose wiring have not been created yet. Do not claim that an
endpoint, runtime command, Docker image, or integration exists until its owning iteration has
implemented and verified it.

## Responsibility

Order Service stores each errand's requester/courier UUID references, captured pickup and
drop-off details, reward, deadline, lifecycle state, and transition history. It owns creation,
editing while OPEN, acceptance, withdrawal, cancellation, pickup, delivery, completion,
automatic expiry, discovery, and history queries.

It consumes User identity through the existing User JWT/JWKS contract and Supplier data through
the published Supplier contract. It must not read either database. Credit Service owns all balance
and reservation effects; Order owns the lifecycle decision that can request those effects.

## D3 architecture decisions

- Use PostgreSQL for transactional order state and Flyway for forward-only schema migrations.
- Use the authenticated JWT subject as the user ID and the signed effective role for role checks.
  Enforce requester/courier-to-order relationships in backend code on every protected action.
- Keep supplier/location snapshots on the order so a later Supplier change, deactivation, or
  deletion cannot rewrite historical errands.
- Make competing OPEN-state transitions atomic and make externally triggered transitions
  idempotent. The exact locking/optimistic-concurrency mechanism is an implementation decision,
  but it must be documented and tested before the acceptance endpoint is merged.
- Add Order-to-Credit calls/events only after a jointly approved contract with the Credit owner.
  A successful HTTP call or published event alone is not a completed workflow; failure,
  duplicate, retry, and reconciliation behavior must be implemented and observable.

## Backlog lifecycle

| Current state | Allowed next state | Actor or trigger |
| --- | --- | --- |
| `OPEN` | `ACCEPTED`, `CANCELLED`, `EXPIRED` | Eligible courier, requester, expiry worker |
| `ACCEPTED` | `OPEN`, `PICKED_UP`, `CANCELLED` | Assigned courier withdrawal, assigned courier, requester |
| `PICKED_UP` | `DELIVERED` | Assigned courier |
| `DELIVERED` | `COMPLETED` | Original requester |

`CANCELLED`, `EXPIRED`, and `COMPLETED` are terminal. A withdrawal after the pickup deadline
becomes `EXPIRED`, not `OPEN`. The D1 backlog is authoritative where an edge case is not listed
here.

## First implementation sequence

Use one invocation at a time, wait for approval of its feature brief, and retain the outcome in
the PR/issue rather than creating local workflow logs:

```text
$foc-iterate-feature order-service-scaffold: Create the verified Order Service backend scaffold
with private PostgreSQL/Flyway persistence, health, OpenAPI, and User JWT validation. Do not add
gateway, Compose, Supplier, or Credit integration.

$foc-iterate-feature order-service-core-lifecycle: Implement approved local Order creation,
OPEN-only editing/cancellation, lifecycle persistence, and backend authorization using User JWT
identity. Do not invent Credit or event contracts.

$foc-iterate-feature order-service-concurrency-expiry: Implement atomic acceptance/expiry races,
safe duplicate transition retries, and automatic OPEN-order expiry with tests.
```

The Credit integration, notification events, frontend, gateway routes, and container topology are
separate approved iterations. See the checklist for their prerequisites and acceptance evidence.
