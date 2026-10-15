# Credit Service agent boundary

Owner: Eldridge. Read the root `AGENTS.md`, `TASK_SPLIT.md`, this file, and the approved D1
backlog before coding. Use `$foc-iterate-feature credit-service-<iteration>: <outcome>` for one
approved, observable outcome at a time.

## D3 service objective

Credit Service is the authoritative writer for FoC's closed credit economy. It must create one
account per activated user, allocate the initial 10 credits once, reserve/release/adjust rewards,
settle completion, apply the specified cancellation compensation, and retain durable transaction
history while keeping every available balance non-negative.

## Ownership and boundaries

- Own Credit schema, account and reservation state, immutable transaction records, balance
  arithmetic, compensation rounding, authorization for credit mutations, and idempotency.
- User Service remains the identity authority. Consume only its published stable UUID/JWT claims
  or an explicitly approved activation contract; never read the User database or issue tokens.
- Order Service owns whether an order is created, accepted, cancelled, expired, or completed.
  Credit applies the corresponding ledger effect only through a jointly published contract; never
  change Order state or write Order tables.
- Supplier data, notification delivery, logging storage, and chat privacy are not Credit-ledger
  concerns. Chat/Translation is a separate Credit-owned N2H area and must not be mixed into the
  first ledger scaffold or used to bypass Order authorization.

## Backlog invariants to preserve

- Allocate exactly 10 available credits once per newly activated account. Repeated, delayed, or
  replayed allocation requests must not grant another allocation.
- A reservation succeeds only when available balance covers the positive whole-credit reward; the
  amount becomes unavailable and remains linked to its order. Account and reservation updates are
  atomic.
- Expired OPEN orders release the full reservation. A successfully completed order transfers the
  full reserved amount to its assigned courier. A requester cancellation that requires courier
  compensation transfers `ceil(reserved amount * 20 / 100)` to the courier and releases the
  remainder to the requester.
- Only approved platform operations and administrators may mutate credit data; users cannot make
  direct peer-to-peer transfers. All acknowledged allocation, reservation, release, adjustment,
  and settlement attempts are idempotent and leave available balances non-negative.

## Cross-service contract gate

Do not invent User activation callbacks, Order-to-Credit endpoint/event payloads, broker topics,
retry behavior, or reconciliation semantics. Before implementing any integration, obtain a joint
contract brief from the producing owner that defines the originating transition, order/user IDs,
operation/idempotency ID, amount/rounding source, allowed caller, terminal outcomes, retry and
reconciliation owner, and audit/observability data. Shared gateway, Compose, `.env.example`,
broker, or CI edits need a named editor and review from every affected service owner.

## Expected implementation shape and checks

Start with a Java 17 Spring Boot service consistent with the existing backend conventions:
PostgreSQL, Flyway forward-only migrations, JPA transactions/locking, validation, Actuator health,
OpenAPI, OAuth2 resource-server JWT validation, and focused controller/service/repository tests.
Document every externally visible ledger operation and event in this README. Do not edit an
applied migration. Once the scaffold exists, run `.\\mvnw.cmd --batch-mode --no-transfer-progress
verify` for backend/API/migration changes; use Compose health checks only for approved runtime
integration.

Use `IMPLEMENTATION_CHECKLIST.md` as the D3 iteration order. Stop and record any missing product
or contract rule instead of making an irreversible balance or privacy decision.
