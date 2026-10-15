# Credit Service

Owned by Eldridge. This service is the D3 source of truth for FoC credit accounts and ledger
effects. Read [`AGENTS.md`](AGENTS.md), [`IMPLEMENTATION_CHECKLIST.md`](IMPLEMENTATION_CHECKLIST.md),
and [`../TASK_SPLIT.md`](../TASK_SPLIT.md) before implementation.

## Current state

This folder is deliberately a D3 implementation starting point: the Credit application, database
schema, ledger APIs/events, tests, and Compose wiring have not been created yet. Do not claim that
an endpoint, runtime command, Docker image, or integration exists until its owning iteration has
implemented and verified it.

## Responsibility

Credit Service stores one account per User UUID, available and reserved amounts, order-linked
reservations, and immutable credit-operation history. It owns first allocation, reserve, release,
reward adjustment, completion settlement, cancellation compensation, idempotency, and the
non-negative balance invariant.

It consumes identity only through the published User contract and lifecycle decisions only through
an approved Order contract. It does not create, update, or infer users/orders and never accesses
their databases. Chat and Translation are separate N2H work and do not belong in the initial
ledger iterations.

## D3 architecture decisions

- Use PostgreSQL for durable balances, reservations, and ledger history, with Flyway for
  forward-only migrations.
- Apply each balance/reservation mutation atomically and require an operation-level idempotency
  identifier so retrying a request cannot repeat a credit effect.
- Represent the initial allocation, reservation, release, adjustment, and settlement as durable
  ledger records rather than a mutable balance alone; keep available and reserved values
  consistent with those records.
- Allocate exactly 10 credits once after User activation. A delayed/repeated integration request
  must resolve to the same allocation outcome without a second grant.
- Derive cancellation compensation only from the approved Order instruction: 20% of the reserved
  amount, rounded up to a whole credit, to the courier; release the remainder to the requester.

## First implementation sequence

Use one invocation at a time, wait for approval of its feature brief, and retain the outcome in
the PR/issue rather than creating local workflow logs:

```text
$foc-iterate-feature credit-service-scaffold: Create the verified Credit Service backend scaffold
with private PostgreSQL/Flyway persistence, health, OpenAPI, and User JWT validation. Do not add
gateway, Compose, User activation, or Order integration.

$foc-iterate-feature credit-service-ledger: Implement approved local credit-account, immutable
ledger, reservation, release, transfer, and non-negative-balance behavior with idempotency tests.
Do not invent User or Order integration contracts.

$foc-iterate-feature credit-service-order-contract: Implement only the jointly approved Order-
Credit reservation/settlement/release contract, including duplicate, failure, and reconciliation
handling.
```

User activation, Order integration, chat/translation, gateway routes, and container topology are
separate approved iterations. See the checklist for their prerequisites and acceptance evidence.
