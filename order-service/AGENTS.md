# Order Service agent boundary

Owner: XueTing. Read the root `AGENTS.md`, `TASK_SPLIT.md`, this file, and the approved D1
backlog before coding. Use `$foc-iterate-feature order-service-<iteration>: <outcome>` for one
approved, observable outcome at a time.

## D3 service objective

Order Service is the authoritative writer for an errand's lifecycle. It must support requester
creation and editing of OPEN errands, courier discovery/acceptance/withdrawal, requester
cancellation, courier pickup/delivery, requester completion confirmation, automatic OPEN-order
expiry, history queries, and safe retries. Its persistence is private and must be independently
deployable.

## Ownership and boundaries

- Own Order schema, migrations, lifecycle/history facts, order APIs, expiry processing, and the
  event definitions produced by Order. Use User UUIDs as requester/courier references; never copy
  or mutate User accounts.
- Use the User Service's published RS256/JWKS JWT contract. Authorize every action from the token
  subject and effective role plus the actor's relationship to the Order; UI visibility is never an
  authorization control.
- Read supplier/location information only through the published Supplier API/contract. Preserve
  the order's captured pickup/drop-off details so later Supplier edits/deletion do not rewrite an
  existing order.
- Credit Service alone owns balances, reservations, releases, transfers, transaction records,
  rounding, and idempotency of credit effects. Order may request a published Credit operation and
  record its own lifecycle fact, but never writes Credit tables or recalculates balances.
- Notifications, Logging, and Chat are separate owners. Order owns lifecycle event names and
  transition meaning; consumers own their delivery/storage behavior.

## Backlog invariants to preserve

- Valid lifecycle facts include OPEN, ACCEPTED, PICKED_UP, DELIVERED, COMPLETED, CANCELLED, and
  EXPIRED. Implement only approved transitions: OPEN -> ACCEPTED/CANCELLED/EXPIRED; ACCEPTED ->
  OPEN on eligible courier withdrawal, PICKED_UP by the assigned courier, or CANCELLED by the
  eligible requester; PICKED_UP -> DELIVERED; DELIVERED -> COMPLETED. A withdrawal after the
  pickup deadline expires the order instead of reopening it.
- The requester may edit only OPEN orders and may not accept their own order. Only the assigned
  courier may withdraw, mark pickup, or mark delivery; only the original requester may confirm
  completion or cancel where the backlog permits it.
- OPEN acceptance, requester cancellation, and expiry must be atomic competing transitions: only
  one winner persists. Duplicate client retries must be safe and must not produce duplicate
  lifecycle events or credit operations.
- An OPEN order expires at its pickup deadline; non-OPEN orders do not expire. Invalid or
  unauthorized transitions leave the order unchanged and use the documented API error contract.
- An order's reward is a positive whole number. Pickup and drop-off cannot be identical. Preserve
  the approved field limits/validation from the backlog in the API contract and tests.

## Cross-service contract gate

Do not invent an Order-to-Credit endpoint, event payload, broker topic, retry policy, or
compensation ordering. Before the first such implementation, create a jointly reviewed contract
brief with the Credit owner that names the operation/event owner, identifier/idempotency key,
success/failure response, retry/reconciliation owner, and observability record. Any gateway,
Compose, `.env.example`, broker, or CI change is shared work: name one editor and obtain review
from all affected owners.

## Expected implementation shape and checks

Start with a Java 17 Spring Boot service matching the existing backend conventions: PostgreSQL,
Flyway forward-only migrations, JPA/transactional service layer, validation, Actuator health,
OpenAPI, OAuth2 resource-server JWT validation, and focused controller/service/repository tests.
Document each externally visible endpoint and event in this service README. Do not edit an applied
migration. Once the scaffold exists, run `.\\mvnw.cmd --batch-mode --no-transfer-progress verify`
for backend/API/migration changes; use Compose health checks for approved runtime integration.

Use `IMPLEMENTATION_CHECKLIST.md` as the D3 iteration order. Record an unresolved product or
contract decision there or in the feature brief and stop at that boundary; do not guess.
