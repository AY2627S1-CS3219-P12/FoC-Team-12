# Order Service D3 design: lifecycle, transitions and API

## Context
Order Service today only creates orders (`POST /api/orders`, stored as `PENDING_CREDIT`) and checks
RS256 JWTs. The README lifecycle table is incomplete: it gives actors but no guards, credit effects,
events or errors, and leaves the deadline boundary open. This plan turns functional requirements
F1–F9 into one complete state machine and API, fills the gaps, and splits the work into
`/foc-iterate-feature` iterations. Owner: XueTing (`order-service/` only).

Decisions confirmed with XueTing:
- **Reward editing stays in D3.** It goes through a Credit adjustment.
- **Event-driven with Kafka.**
  - Order and Credit communicate only through Kafka events, never through each other's database or synchronous calls.
  - Order writes events to a transactional outbox and a relay publishes them to Kafka.
  - Credit's replies are consumed idempotently.
  - A dev/test **credit stub** (a Kafka listener) stands in for Credit until it exists.
  - The Credit event contract needs Eldridge's approval.
  - Kafka in Compose is a shared file: Jun Hui owns event-broker reliability, so he edits or reviews it.
- **Session role must match the action**, otherwise 403. This applies to mutations only; reads just need a valid token.
  - `REQUESTER`: create, edit, cancel, confirm receipt.
  - `COURIER`: accept, withdraw, pick up, deliver.
- **Locations come only from the client.** Order Service never calls Supplier Service.
  - The client picks locations from the Supplier UI/API itself and sends `pickupLocationId`,
    `pickupLocationName`, `dropoffLocationId` and `dropoffLocationName` in the request.
  - Order validates the format (UUIDs, names 1–160 characters, pickup ≠ drop-off) and stores the
    values as the snapshot.
  - Order does **not** check that a location exists or is ACTIVE. That's an accepted trade-off:
    the client is responsible for picking valid locations.

## Architecture

```
Client ─► Gateway (/api/orders/**) ─► Order Service ──► order-db (Postgres, private)
                                          │  ▲
                        outbox relay ─────┘  │ consumer (inbox / dedupe)
                                          ▼  │
   Kafka topics:  order.events  ─────────►  Credit Service, Notifications (and other consumers)
                  credit.events ◄────────  Credit Service
User Service ── JWKS ──► Order (token verification only)
(No Order → Supplier calls: the client sends location IDs and names, taken from Supplier's public API.)
```

- **Database per service.** Only Order touches `order-db`. It stores user and location UUIDs,
  never foreign keys into other services.
- **Order is the producer of lifecycle facts** (`order.events`). It never decides balances; Credit
  applies the money effects and replies with outcomes (`credit.events`). This is choreography:
  Order publishes facts and Credit reacts, rather than Order sending commands.
- **The only synchronous outbound call is the JWKS fetch.** Order never calls Supplier or Credit
  directly. Every interaction that crosses a service boundary goes through Kafka.
- **Reliability:**
  - at-least-once delivery;
  - the transactional outbox prevents "saved but not published";
  - inbox de-duplication prevents double-applying a replayed event.

### Kafka contract (proposal; needs Eldridge and Jun Hui to approve)

| Topic | Producer | Key | Partitions | Consumers |
|---|---|---|---|---|
| `order.events` | Order | `orderId` | 3 | Credit, Notifications (N2H), Logging |
| `credit.events` | Credit | `orderId` | 3 | Order |
| `*.DLT` | Spring retry | same key | 1 | Ops / observability |

- **Per-order ordering.** Keying by `orderId` keeps all of one order's events on one partition, so
  they are consumed in order. Consumers still check `aggregateVersion` and ignore stale events.
- **Envelope.** The README envelope is kept as JSON: `eventId`, `eventType`, `eventVersion`,
  `aggregateId`, `aggregateVersion`, `occurredAt`, `producer`, `correlationId`, `causationId`,
  `actor` and `data`. Credit-affecting events also carry `operationId` in `data`.
- **Events Order publishes:**
  - `OrderSubmitted` (reserve);
  - `OrderOpened`, `OrderUpdated`;
  - `OrderRewardChangeRequested` (adjust), `OrderRewardChanged`, `OrderRewardChangeRejected`;
  - `OrderAccepted`, `OrderReopened`, `OrderPickedUp`, `OrderDelivered`;
  - `OrderCancelled` (release, or compensate when `compensationRequired=true`);
  - `OrderExpired` (release);
  - `OrderCompleted` (settle);
  - `OrderReservationFailed`.
- **Credit replies Order consumes:**
  - `CreditReserved` (carries `reservationId`), `CreditReservationRejected`;
  - `CreditAdjusted`, `CreditAdjustmentRejected`;
  - `CreditReleased`, `CreditSettled`, `CourierCompensated`. These three only update the order's
    credit-status fields and never change its state.
  - Replies carry the `operationId` from the event that caused them, plus `causationId`.
- **Producer settings:** `acks=all`, `enable.idempotence=true`, key = `orderId`.
- **Consumer settings:**
  - group `order-service`;
  - manual ack only after the database transaction commits;
  - 3 retries with backoff, then the DLT.

## Global rules (resolved gaps)

1. **Deadline boundary.**
   - **Expired ⇔ `now >= pickupDeadline`**, using the server clock in UTC.
   - Create and edit require `pickupDeadline > now`. The existing `@Future` check already does this.
   - An injectable `Clock` bean is used so tests can control time.
2. **Expiry has two triggers, with the same outcome:**
   - a scheduler runs every 30 s and expires `OPEN` orders where `pickup_deadline <= now`;
   - **lazy expiry**: any action on an `OPEN` order that is past its deadline expires it first, in
     the same transaction, then rejects the action.
   - So no order is ever accepted at or after its deadline (F5.4, F8.1).
3. **Only `OPEN` orders expire automatically** (F8.2/F8.3).
   - Accepted orders never expire automatically.
   - **Late pickup is allowed**: the courier may still pick up an `ACCEPTED` order after the deadline.
   - The deadline only affects acceptance, expiry and withdrawal. *(Gap. Confirm against the backlog.)*
4. **Concurrency.**
   - Every transition runs in one transaction, loading the row with `PESSIMISTIC_WRITE`
     (`SELECT … FOR UPDATE`).
   - The first request processed wins. Losers then see the new state and get a 409 (F5.3/F5.3.1).
   - Edits also require the client's `version` (optimistic check, as Supplier does) to prevent lost updates.
5. **Atomicity (F7.2.1).**
   - The state change, the history row and the outbox event commit together or not at all.
   - A truncated or malformed body fails with 400 before any transaction starts, so the state is unchanged.
   - Action endpoints have no body.
6. **Duplicate requests (F7.1.1).**
   - A request counts as a duplicate when the order **already occupies the action's target state**
     **and** the latest history entry for that action was made by the **same caller**.
   - A duplicate returns `200` with the current order. It publishes no event, writes no history and
     has no credit effect.
   - The same target state reached by a *different* actor is a 409, e.g. losing an acceptance race.
   - Every credit-affecting event also carries an `operationId = {orderId}:{action}:{orderVersion}`
     so Credit can de-duplicate replays. Order never issues a second command for the same transition.
7. **Order of checks** for every action:
   1. authentication (401);
   2. session role (403 `ROLE_NOT_PERMITTED`);
   3. load the order (404);
   4. lazy expiry;
   5. duplicate check (200);
   6. relationship (403);
   7. state guard (409);
   8. deadline guard (409).
8. **Courier assignment.**
   - `courier_id` is set only in `ACCEPTED`, `PICKED_UP`, `DELIVERED` and `COMPLETED`. The existing
     DB constraint `chk_courier_assignment` enforces this.
   - When the courier is cleared, their ID is kept in the history row and carried in the event for Credit.
9. **Re-acceptance.**
   - A courier who withdrew may accept the same order again.
   - The pool excludes the caller's own requests (self-acceptance is forbidden).
   - *(Gap. Confirm.)*

## States
- **`PENDING_CREDIT`:** the order is saved and waiting for Credit to reserve the reward. It isn't
  visible in the pool.
- **`OPEN`:** the reward is reserved, the order is in the pool and can be edited.
  - Its *adjustment-pending* sub-flag is `pending_credit_reward IS NOT NULL`.
  - While the flag is set, the order is hidden from the pool and can't be accepted.
- **Active states:** `ACCEPTED`, `PICKED_UP`, `DELIVERED`.
- **Terminal states:** `COMPLETED`, `CANCELLED`, `EXPIRED`, `RESERVATION_FAILED`.
  - `terminal_reason` records why.
  - Values: `REQUESTER_CANCELLED_OPEN`, `REQUESTER_CANCELLED_ACCEPTED`, `PICKUP_DEADLINE_PASSED`,
    `COURIER_WITHDREW_AFTER_DEADLINE`, `CREDIT_RESERVATION_REJECTED`.

## Transition table

Notation: **R** = the order's requester (session role `REQUESTER`). **C** = the assigned courier
(session role `COURIER`). **Sys** = the scheduler or a Credit reply.

| # | From → To | Trigger / endpoint | Actor | Guard | Credit effect (via event) | Event | Errors |
|---|---|---|---|---|---|---|---|
| T1 | ∅ → PENDING_CREDIT | `POST /api/orders` | Any user, REQUESTER session; becomes R | Valid fields (F1.1.2), including the client-supplied location IDs and names; deadline > now | Credit **reserves** `creditReward` | `OrderSubmitted` | 400 errors map, 403 |
| T2 | PENDING_CREDIT → OPEN | `CreditReserved` reply | Sys | State is PENDING_CREDIT and now < deadline; store `credit_reservation_id` | none | `OrderOpened` | Duplicate reply is ignored |
| T2b | PENDING_CREDIT → EXPIRED | `CreditReserved` reply arrives at or after the deadline | Sys | now ≥ deadline | **Release** the full reservation | `OrderExpired` (reason `PICKUP_DEADLINE_PASSED`) | — |
| T3 | PENDING_CREDIT → RESERVATION_FAILED | `CreditReservationRejected` reply | Sys | State is PENDING_CREDIT | none | `OrderReservationFailed` | — |
| T4 | OPEN → OPEN (details) | `PATCH /api/orders/{id}` with `version` | R | OPEN, no pending adjustment, version matches, valid fields, deadline > now | none (unless the reward changed, see T5) | `OrderUpdated` | 400, 403 `NOT_ORDER_REQUESTER`, 409 `VERSION_CONFLICT` / `INVALID_STATE_TRANSITION` / `REWARD_ADJUSTMENT_PENDING` |
| T5 | OPEN → OPEN (reward requested) | The same `PATCH` with a different `creditReward` | R | As T4; set `pending_credit_reward` and leave `credit_reward` unchanged | Credit **adjusts**: reserves the extra if affordable, or releases the difference | `OrderRewardChangeRequested` | As T4 |
| T5a | OPEN → OPEN (reward applied) | `CreditAdjusted` reply | Sys | Pending value matches the reply | Already applied by Credit | `OrderRewardChanged` | Ignored if the order is no longer OPEN |
| T5b | OPEN → OPEN (reward rejected) | `CreditAdjustmentRejected` reply | Sys | Pending value matches the reply; clear it | none; the old reservation stands | `OrderRewardChangeRejected` (the client shows "insufficient credits") | Ignored if no longer OPEN |
| T6 | OPEN → CANCELLED | `POST /api/orders/{id}/cancel` | R | OPEN (F3.1) | **Release** the full reservation, no compensation | `OrderCancelled` (`compensationRequired=false`) | 403, 409 `INVALID_STATE_TRANSITION` |
| T7 | OPEN → EXPIRED | Scheduler or lazy expiry | Sys | OPEN and now ≥ deadline (F8.1) | **Release** the full reservation | `OrderExpired` (`PICKUP_DEADLINE_PASSED`) | — |
| T8 | OPEN → ACCEPTED | `POST /api/orders/{id}/accept` | Any user except R, COURIER session; becomes C | OPEN, now < deadline, no pending adjustment, caller ≠ requester (F5.2) | none; the reservation stays held | `OrderAccepted` | 403 `SELF_ACCEPTANCE_FORBIDDEN`; 409 `ORDER_ALREADY_ACCEPTED` (race loser, F5.3.1), `ORDER_EXPIRED` (F5.4.2, lazy expiry ran), `REWARD_ADJUSTMENT_PENDING`, `INVALID_STATE_TRANSITION` |
| T9 | ACCEPTED → OPEN | `POST /api/orders/{id}/withdraw` | C | ACCEPTED and now < deadline (F3.2); clear the courier | none; the reservation stays held | `OrderReopened` (`withdrawnCourierId`); back in the pool (F3.2.2) | 403 `NOT_ASSIGNED_COURIER`, 409 |
| T10 | ACCEPTED → EXPIRED | Same `withdraw` endpoint | C | ACCEPTED and now ≥ deadline (F3.2.3); clear the courier | **Release** the full reservation to R | `OrderExpired` (`COURIER_WITHDREW_AFTER_DEADLINE`) | As T9 |
| T11 | ACCEPTED → CANCELLED | `POST /api/orders/{id}/cancel` | R | ACCEPTED, not yet picked up (F3.3); clear the courier | **Compensate**: courier gets `ceil(reserved × 20 / 100)`, the rest goes back to R (F3.3.2) | `OrderCancelled` (`compensationRequired=true`, `courierId`) | 403, 409 |
| T12 | ACCEPTED → PICKED_UP | `POST /api/orders/{id}/pickup` | C | ACCEPTED (F6.1); late pickup allowed | none | `OrderPickedUp` | 403 `NOT_ASSIGNED_COURIER`, 409 |
| T13 | PICKED_UP → DELIVERED | `POST /api/orders/{id}/deliver` | C | PICKED_UP (F6.2) | none | `OrderDelivered` | 403, 409 |
| T14 | DELIVERED → COMPLETED | `POST /api/orders/{id}/complete` | R | DELIVERED (F6.3) | **Settle**: the full reservation goes to C | `OrderCompleted` | 403, 409 |
| — | PICKED_UP / DELIVERED / COMPLETED → CANCELLED | `cancel` from R, or `withdraw` from C | — | Always rejected (F3.4/F3.4.1) | none | none | 409 `CANCELLATION_NOT_ALLOWED` |
| — | Any terminal → anything | Any action | — | Rejected, except a duplicate of the same action (rule 6) | none | none | 409 `INVALID_STATE_TRANSITION` |

**Duplicate completion (F7.1.1).**
- If `complete` is sent again by R on an order that's already `COMPLETED`, it returns `200` with the order.
- It publishes no second `OrderCompleted` and no second settlement.
- Credit also de-duplicates on `operationId`, as a second safeguard.
- The same rule covers cancel→CANCELLED, pickup→PICKED_UP, deliver→DELIVERED and accept→ACCEPTED,
  but only when the same courier sends the repeat.
- Withdraw repeats count as duplicates when the order is `OPEN` or `EXPIRED` and the last
  `WITHDRAW` history entry was made by the caller.

**Errors.**
- All errors are RFC-7807 `application/problem+json`, with a `code` property and `currentState`
  where it's relevant.
- These codes are added to the existing `ApiExceptionHandler`.

## Read APIs
- **`GET /api/orders`: the open pool** (F4.1–F4.3).
  - Includes only `state=OPEN`, `pickup_deadline > now`, no pending adjustment, and not the caller's own orders.
  - Filters: `minReward`, `maxReward`, `pickupLocationId`, `dropoffLocationId`.
  - Sort: `reward,desc` | `pickupDeadline,asc` | `pickupLocationName,asc`.
  - Paging: `page`, `size` (max 50).
  - No matches returns `200` with an empty page, which the client shows as "no matches" (F4.5).
  - Uses the existing partial indexes in V1.
- **`GET /api/orders/{id}`.**
  - OPEN orders are visible to any authenticated user.
  - In other states, only R or the current courier can see the order. Anyone else gets 404, so it
    isn't revealed that the order exists.
- **`GET /api/orders/{id}/history`:** the transition history, visible to participants only.
- **`GET /api/orders/me?as=requester`:** R's orders in `COMPLETED`, `CANCELLED` or `EXPIRED` (F9.1).
  - `RESERVATION_FAILED` is excluded. *(Gap. Confirm.)*
- **`GET /api/orders/me?as=courier`:** `COMPLETED` orders where the caller was the courier (F9.2).
- **Client-only requirements:**
  - F1.1.1 form validation, F4.4 remembering filters, and the F5.1.1/F5.1.2 confirmation popup;
  - the API supports them, but the server can't enforce them;
  - **gap: who owns the Order UI** (Order Service has no frontend).

## Data model (new migration `V2__order_lifecycle.sql`; V1 is never edited)
- **`order_transitions`:**
  - `id`, `order_id`, `action`, `from_state`, `to_state`, `actor_id`, `actor_role`, `courier_id`,
    `reason`, `order_version`, `occurred_at`;
  - index on `(order_id, occurred_at)`.
  - Used for the history view (F9) and for duplicate detection.
- **`outbox_events`:**
  - `id` (= eventId), `aggregate_id`, `aggregate_version`, `event_type`, `topic`, `payload JSONB`,
    `created_at`, `published_at NULL`, `attempts`;
  - partial index where `published_at IS NULL`.
- **`processed_events`** (the consumer inbox):
  - `event_id` primary key, plus `consumed_at`;
  - inserted in the same transaction as the order update. A duplicate key means "already handled", so the event is skipped.
- **`orders`:**
  - add `credit_status` (`RESERVED`, `RELEASED`, `SETTLED`, `COMPENSATED`) so the later Credit
    outcomes are visible;
  - updated only by the `credit.events` consumer.
- **`orders` entity:**
  - map the existing V1 columns: `courier_id`, the two snapshot names, `pending_credit_reward`,
    `credit_reservation_id`, `terminal_reason` and the `*_at` timestamps;
  - add domain methods, one per transition, each returning the event to record.

## Code structure (all under `order-service/src/main/java/com/friendoncampus/order/`)
- `domain/Order.java`: pure transition methods (`accept(courierId, now)`, `withdraw(now)`, …) that
  throw `InvalidTransitionException`.
- `domain/OrderAction.java`: the action enum.
- `domain/TerminalReason.java`: the terminal-reason enum.
- `service/OrderLifecycleService.java`:
  - one `@Transactional` method per action;
  - each does lock → lazy expiry → duplicate check → transition, then saves the history row and
    the outbox event;
  - it reuses `OrderService` for create and edit.
- `service/OrderExpiryScheduler.java`:
  - `@Scheduled(fixedDelay = 30s)`;
  - selects batches with `FOR UPDATE SKIP LOCKED`.
- `messaging/OutboxRecorder.java`: writes the event row inside the transition transaction.
- `messaging/OutboxRelay.java`:
  - `@Scheduled` every 1 s;
  - claims unpublished rows with `FOR UPDATE SKIP LOCKED`, then sends each one through
    `KafkaTemplate` and waits for the broker acknowledgement;
  - marks a row `published_at` only after the send succeeds. Failures increase `attempts` and are
    retried, with a metric and a log.
- `messaging/CreditEventsListener.java`:
  - a `@KafkaListener` on `credit.events`;
  - inserts into the `processed_events` inbox, then calls `CreditReplyHandler`;
  - covers T2, T2b, T3, T5a and T5b, plus the `credit_status` updates.
- `messaging/stub/CreditStubListener.java`:
  - only active with `@Profile("credit-stub")`;
  - consumes `order.events` and publishes matching `credit.events`: always reserve, always adjust,
    and acknowledge every release, settlement and compensation;
  - stands in for Credit until it exists. It's removed once Credit consumes the topic.
- `config/KafkaConfiguration.java`:
  - declares the topics with `NewTopic` beans;
  - JSON serde for the envelope;
  - `DefaultErrorHandler` with backoff and a DLT recoverer.
- New dependency: `spring-kafka`. Properties: `spring.kafka.bootstrap-servers=${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}`.
- `web/dto/CreateOrderRequest.java` and `UpdateOrderRequest.java`:
  - add `pickupLocationName` and `dropoffLocationName` (`@NotBlank`, `@Size(max = 160)`, trimmed);
  - stored in the existing V1 snapshot columns.
- `web/OrderController.java`: the new endpoints.
- `config/SecurityConfiguration.java`:
  - per-route `hasRole(...)` rules, following the role/action mapping above;
  - reads `authenticated()`.

## Iterations (each one is a `/foc-iterate-feature order-…` run)
1. **`order-lifecycle-core`:**
   - the V2 migration, the domain state machine with a table-driven unit test for every (state, action) pair;
   - history recording and the outbox recorder (rows only, not yet relayed);
   - `GET /{id}` and `/{id}/history`, plus the error codes.
2. **`order-kafka-messaging`:**
   - `spring-kafka`, the outbox relay, the `credit.events` listener with inbox, the DLT;
   - the `credit-stub` profile, so T2 and T3 work end to end (PENDING_CREDIT → OPEN through Kafka).
   - Shared-file follow-up: Kafka (KRaft, a single broker) in `compose.yaml` and `KAFKA_BOOTSTRAP_SERVERS`
     in `.env.example`. Jun Hui edits or reviews these.
3. **`order-edit-cancel`:** T4 and T6, with version checks.
4. **`order-accept-expiry`:**
   - T7, T8, the scheduler and lazy expiry;
   - race tests: accept/accept, accept/expiry and accept/cancel.
5. **`order-courier-progress`:** T9–T14, the rules for blocked cancellation, and duplicate completion.
6. **`order-discovery-history`:** the pool's filters, sorting and paging, and the F9 history endpoints.
7. **`order-location-snapshot`:**
   - accept the client-supplied location names on create and edit, and validate them;
   - store them in the snapshot columns;
   - this is what makes F4.3's pickup-name sort possible;
   - no cross-service dependency.
8. **`order-reward-adjust`:** T5, T5a and T5b through Kafka against the stub.
9. **`order-credit-integration`:**
   - switch from the stub to the real Credit consumer and producer, using the approved event contract;
   - needs Eldridge;
   - demonstrates recovery: Credit down, then a replay with no double effect.

## Open items to confirm (flag to the backlog and owners)
- Late pickup after the deadline is allowed (rule 3).
- A courier who withdrew may re-accept the same order (rule 9).
- `RESERVATION_FAILED` is excluded from F9.1 history.
- F3.3.2 says "release the 20%". The plan uses Credit's rule instead: the courier gets
  `ceil(20%)` and the remainder goes back to the requester.
- Ownership of the Order UI (F1.1.1, F4.2–F4.5, F5.1.1/2).
- The Kafka topic names and the event names and payloads above. These need Eldridge (Credit) and
  Jun Hui (broker owner) to approve before iteration 9; iterations 2–8 use the stub.
- The Kafka Compose service, which is a shared file (Jun Hui).

## Verification
- **Every iteration:** `cd order-service && ./mvnw -B verify` with JDK 17.
- **Unit:** a table-driven state-machine test covering every (state, action) pair, with the expected
  result or error code. Deadline-boundary tests use a fixed `Clock`:
  - `now == deadline` means expired;
  - `now == deadline − 1 ms` means still open.
- **Database and race tests:**
  - add Testcontainers PostgreSQL, which needs Docker running;
  - test two concurrent accepts (exactly one gets 201, the other `ORDER_ALREADY_ACCEPTED`);
  - test accept against the scheduler at the deadline;
  - test a duplicate `complete` (one `OrderCompleted` outbox row);
  - test that a failed transition writes no history and no outbox row.
- **Kafka tests:** use Testcontainers Kafka (`org.testcontainers:kafka`) with the `credit-stub` profile.
  - A created order becomes OPEN through `OrderSubmitted` → `CreditReserved`.
  - Publishing the same `CreditReserved` twice gives one state change (inbox de-duplication).
  - With the broker down, rows stay unpublished; once it's back the relay delivers them.
  - A poison message lands in `credit.events.DLT`.
- **Security:** a 403 for each wrong session role or non-participant, and `SELF_ACCEPTANCE_FORBIDDEN`.
- **Docs:**
  - save this design as `order-service/DESIGN.md` and link it from the README;
  - update the README lifecycle table to match;
  - replace the README line saying location names "arrive asynchronously via an event". The client
    now supplies them, and they're required by the application even though the V1 columns allow null.
