# Notification Service design

## Context

- **Notifications are an N2H feature** owned by XueTing ([TASK_SPLIT.md](../TASK_SPLIT.md)).
- **Order's lifecycle is the main source of facts** ([Order DESIGN](../order-service/DESIGN.md)),
  together with Credit's outcomes in the shared
  [event communication blueprint](../docs/integration/event-communication-blueprint.md).
- **The wireframes show a bell and a Notifications page**, but no backend exists yet
  ([Order design-source](../order-service/frontend/docs/design-source.md)).
- The service keeps only enough to show "what happened to me, on which errand, and have I seen it".
  Anything else is fetched from the service that owns it, for example the errand details when the
  user clicks through.

## Architecture

```
Order ──► order.lifecycle.events (proposed) ─┐
Credit ─► credit.events ─────────────────────┼─► Notification Service ──► notification-db (private)
                                             │       ▲
User Service ── JWKS ──► (token verification)│       │ GET /api/notifications/me (Bearer JWT)
                                                 UI ─► Gateway
```

- **Database per service.** Only Notification touches `notification-db`. It stores user and order
  UUIDs, never foreign keys into other services.
- **Consumer only.** Notification publishes nothing and calls no other service. The only
  synchronous outbound call is the JWKS fetch.
- **Reliability:** at-least-once delivery from Kafka, inbox de-duplication by `eventId`, a
  business key per source operation, and acknowledgement only after commit.

## What is stored, and what isn't

| Stored | Not stored |
| --- | --- |
| Who the notification is for (User UUID) | Emails, usernames, or any other profile data (User owns these) |
| What happened (type, order ID, a few values like the credit amount) | A copy of the order or the credit balance (Order and Credit own these) |
| Which event it came from (`eventId`, `correlationId`) | Tokens, passwords, or full event payloads |
| Whether it has been read (`read_at`) | The message text (built from a template when read, so wording can change later) |

## Data model

`V1__create_notifications.sql` (not yet applied in any shared environment; once it is, it is never
edited). The columns and reasons are in the
[README](README.md#data-model-and-delivery-guarantees). Differences from the first draft:

- **No foreign key from `notifications.source_event_id` to the inbox.** Inbox rows are pruned sooner
  than notifications, and the foreign key would block that. `UNIQUE (source_event_id, recipient_id)`
  still blocks a duplicate row.
- **No CHECK on `notifications.type`.** Java validates it, so a new type needs no migration.
  `notification_inbox.outcome` is checked (`NOTIFIED`, `IGNORED`, `DUPLICATE_OPERATION`).
- **`business_key` with `UNIQUE (recipient_id, type, business_key)`** (blueprint rule). Credit
  outcomes get a fresh `eventId` every time Credit processes an operation, including one it already
  applied, so `eventId` alone cannot stop a reconciliation replay from notifying twice. The key is
  Credit's `operationId`; for Order it will be `orderId:sourceSequence`. The handler looks the key up
  before inserting, so a repeat is recorded as `DUPLICATE_OPERATION` and acknowledged.

## Event mapping

### From `credit.events` (built)

| Credit event | Recipient | Type |
| --- | --- | --- |
| `CreditAccountAllocated` | `data.userId` | `CREDITS_WELCOME` |
| `CreditSettled` | `data.courierId` | `CREDITS_RECEIVED` |
| `CourierCompensated` | `data.courierId` (the requester cancelled, so is not told) | `CREDITS_COMPENSATED` |
| Every other type, including future ones | nobody | inbox row `IGNORED` |

Credit events carry no errand title, so these messages do not name the errand; the notification
links to it through `orderId`.

### From `order.lifecycle.events` (proposed, iteration 5)

The actor (`actor.userId`) is never notified.

| Transition | Recipient | Type |
| --- | --- | --- |
| T2 `PENDING_CREDIT → OPEN` | requester | `ORDER_OPENED` |
| T3 `→ RESERVATION_FAILED` | requester | `ORDER_RESERVATION_FAILED` (`params.reason`) |
| T5b reward change rejected | requester | `ORDER_REWARD_CHANGE_REJECTED` |
| T8 `OPEN → ACCEPTED` | requester | `ORDER_ACCEPTED` |
| T9 `ACCEPTED → OPEN` (courier withdrew) | requester | `ORDER_COURIER_WITHDREW` |
| T10 `ACCEPTED → EXPIRED` (withdrew after deadline) | requester | `ORDER_EXPIRED` |
| T2b, T7 `→ EXPIRED` | requester | `ORDER_EXPIRED` |
| T11 `ACCEPTED → CANCELLED` | the courier before the change | `ORDER_CANCELLED` |
| T12 `→ PICKED_UP` | requester | `ORDER_PICKED_UP` |
| T13 `→ DELIVERED` | requester | `ORDER_DELIVERED` |
| T14 `→ COMPLETED` | courier | `ORDER_COMPLETED` |
| T1, T4, T5, T5a, T6 | nobody (the requester acted, or no one else is involved) | recorded `IGNORED` |

The courier gets two notifications for T11 and T14: `ORDER_CANCELLED` + `CREDITS_COMPENSATED`, and
`ORDER_COMPLETED` + `CREDITS_RECEIVED`. Both are kept, so the lifecycle news is not delayed by
Credit (approved 2026-11-04).

## Proposed contract: `OrderTransitioned` on `order.lifecycle.events`

**Status: proposed, not approved.** The shape is the shared one in
[n2h-events.schema.json](../docs/contracts/n2h-events.schema.json) (example in
[events.examples.json](../docs/contracts/events.examples.json)); Chat consumes the same event, so
neither consumer renames fields. Until it is approved nothing publishes or consumes it.

| Item | Proposal |
| --- | --- |
| Producer | Order Service (XueTing), through its existing transactional outbox |
| Consumers | Notification (group `notification-service`) and Chat (group `chat-service-timeline`) |
| Topic | `order.lifecycle.events`, 3 partitions, 7-day retention; `order.lifecycle.events.DLT`, 1 partition, 30 days |
| Key | Order UUID, so one errand's events stay in order |
| Why a new topic | Credit rejects unknown event types on `order.events`, so adding them there would force a Credit change |
| Envelope | The blueprint's required envelope: `eventType` = `OrderTransitioned`, `aggregateType` = `Order`, `aggregateVersion` = the order version after the change, `producer` = `order-service`, the order's `correlationId`, `causationId` = the Credit outcome's `eventId` for T2, T2b, T3 and T5b, otherwise null, and `actor` |
| Operation identity | `eventId` per message; `orderId` + `sourceSequence` per transition. There is no `operationId`, because no credit effect is requested |
| Duplicates | The Notification inbox ignores a repeated `eventId`; the business key `orderId:sourceSequence` ignores the same transition under a new `eventId`. Order writes exactly one outbox row per applied transition and none for a duplicate or rejected request |
| Failure and retry | Order's outbox relay retries until Kafka acknowledges. Notification retries transient failures three times and then dead-letters; rejected events go straight to the DLT |
| Reconciliation | Notifications are informational, so a lost event means a missing notification, not a wrong balance. A gap in `sourceSequence` is logged, never filled by guessing. A DLT record can be replayed after it is fixed |
| Observability | Both sides log `eventId`, `eventType`, `correlationId`, `orderId`, `sourceSequence` and outcome; DLT counts are monitored with the others |

`data` (an acceptance):

```json
{
  "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
  "requesterId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
  "previousCourierId": null,
  "courierId": "5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10",
  "fromState": "OPEN",
  "toState": "ACCEPTED",
  "action": "ACCEPT",
  "sourceSequence": 4,
  "reasonCode": null,
  "snapshot": {
    "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
    "requesterId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
    "courierId": "5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10",
    "status": "ACCEPTED",
    "title": "Buy coffee",
    "description": "Flat white from the library cafe",
    "creditReward": 3,
    "pickupDeadline": "2026-10-30T10:00:00Z",
    "pickupLocationId": "…",
    "dropoffLocationId": "…",
    "pickupLocationName": "Library cafe",
    "dropoffLocationName": "Block E lobby"
  }
}
```

- `action` is one of `SUBMIT`, `OPEN`, `FAIL_RESERVATION`, `CANCEL`, `EXPIRE`, `ACCEPT`,
  `WITHDRAW`, `PICK_UP`, `DELIVER`, `COMPLETE`, `EDIT`, `REWARD_CHANGE_APPLIED`,
  `REWARD_CHANGE_REJECTED`. Details-only edits are published too (`fromState` = `toState`), because
  Chat's timeline needs them; Notification records them as `IGNORED`.
- **`previousCourierId` keeps the courier a transition removed.** Withdrawal (T9, T10) and
  cancellation after acceptance (T11) clear `courierId`, so the recipient for those rows is
  `previousCourierId`. `snapshot.status` equals `toState`.
- `reasonCode` is the safe, approved reason for `RESERVATION_FAILED` and rejected reward changes;
  otherwise null. Notification shows only approved codes, never free text.
- `snapshot` is the order as it was right after the change, so later edits do not rewrite past
  notifications and Notification never calls Order.

### `sourceSequence`

A per-order counter for published transitions, from the shared rule "starts at 1 and is contiguous
per source/stream/aggregate, not entity version" ([contract notes](../docs/contracts/README.md)).

- **Only committed transitions take a number.** Order increments it in the same transaction that
  writes the transition and its outbox row; a rejected or rolled-back request (a late accept, a
  race loser, a repeated action) takes none. So consumers can treat a gap as a missing event.
- **Not the JPA `version`.** That also changes for writes that publish nothing, such as Credit
  status updates, so it would leave gaps.
- **Lazy expiry** (an action on an overdue OPEN order) commits `OPEN → EXPIRED` with the next number
  and a `SYSTEM` actor, then rejects the action. The caller only triggered it, so the expiry is
  not attributed to them and the requester is still notified.
- Order needs a new `source_sequence` column for this; it is part of iteration 4.

Example: submit (1), opened (2), title edited (3), Alice accepts (4), Alice withdraws (5), Bob
accepts (6). The requester gets `ORDER_ACCEPTED` twice, keys `513ea56a…:4` and `513ea56a…:6`;
an accept after expiry adds nothing.

## Planned shared changes

The plan was approved on 2026-11-04 (iteration 0). Each shared file still has one nominated editor
and needs review from the affected owners when it is changed ([root AGENTS.md](../AGENTS.md)).
Nothing below is changed by iterations 0–2a.

| Area | Change | Affected owners |
| --- | --- | --- |
| Kafka topics and ACLs (`deploy/kafka/initialize.sh`, `verify.sh`) | Create `order.lifecycle.events` and its DLT. Add user `notification_service`: Read and Describe on `credit.events` and `order.lifecycle.events`, Read on group `notification-service`, Write on `credit.events.DLT` and `order.lifecycle.events.DLT`, and IdempotentWrite. Give `order_service` Write on `order.lifecycle.events`. Give `kafka_ui` read access to the new topics and group. | Jun Hui |
| Kafka secrets (`broker-entrypoint.sh`, `k8s/New-KafkaSecrets.ps1`, `k8s/broker.yaml`, `Test-LocalKafka.sh`) | Add the password `KAFKA_NOTIFICATION_SERVICE_PASSWORD` | Jun Hui |
| DLT sharing | Notification writes failed `credit.events` records to the existing `credit.events.DLT`. Spring's `kafka_dlt-original-consumer-group` header says which consumer failed | Jun Hui, Eldridge |
| Compose and `.env.example` | Add `notification-service` and `notification-db`, the `NOTIFICATION_DB_*` variables and the Kafka password. Every new `${VAR:?}` goes into `.env.example`, every CI job that runs Compose and `Test-LocalKafka.sh` | All |
| Gateway (`application.yml`, `k8s/deployment.yaml`) | Routes `/api/notifications/**` and `/docs/notification/openapi.json`, later the UI routes, and `NOTIFICATION_SERVICE_URL` | Gateway nominee |
| Kubernetes | Add `notification-service/k8s/` (copied from Order's layout), and `notification` in `New-DatabaseSecret.ps1` and `Test-LocalDeployment.ps1` | Darryl |
| Network policies (`deploy/k8s/network/policies.yaml`) | New `foc-notification` and `foc-notification-db` policies. Add `notification-service` to `foc-user` ingress, the Kafka client policy and gateway egress (port 8084) | Darryl, Jun Hui |
| CI | Add `notification-service` to `SERVICES` in `image_plan.py` and its test, and a backend job in `ci.yml` | All |
| Header bell | A link and badge in every service's header (iteration 7) | Darryl, Jun Hui, Eldridge |

## Decisions

Approved with the iteration 0–2 brief (2026-11-02):
- Failed `credit.events` records go to the shared `credit.events.DLT`; no new DLT topic.
- Any session role, including `ADMIN`, may read; each user reads only their own notifications.
- `GET /api/notifications` returns stored rows from iteration 1 on (moved to `/me`, below).
- The requester gets no notification for `CourierCompensated`.

Approved with the `read-api` brief (2026-11-03):
- The read API follows the shared contract: `GET /api/notifications/me`, `content`/`totalElements`,
  size 1–100, server-rendered `message` and `readAt`.
- Credit notifications are also de-duplicated by `operationId`; a repeat is `DUPLICATE_OPERATION`.
- `OrderTransitioned` uses the shared schema (`previousCourierId`, `reasonCode`, `snapshot`,
  `sourceSequence`) instead of this document's first draft.

Approved with iteration 0 (2026-11-04):
- The contract proposal and the [planned shared changes](#planned-shared-changes).
- A separate `order.lifecycle.events` topic rather than more events on `order.events`.
- The courier keeps both notifications for T11 and T14.
- **Retention:** delete read notifications after 30 days and every notification after 90 days.
  Keep inbox rows **at least 30 days**: DLT topics retain records for 30 days, so a replay after the
  inbox row was pruned would notify twice. Enforced by the retention job (iteration 8); until then
  nothing is deleted.

To confirm with the team:
1. Where the bell lives: in all four headers, or only a Notifications page linked from the main page.

Implementation details (no decision needed):
- `auto-offset-reset=earliest`: on first start the service reads the 7 days still on `credit.events`,
  so recent accounts get their welcome notification.
- Live updates use polling first (iteration 7). Server-sent events would need a way to send the
  token, because the browser's `EventSource` cannot set an `Authorization` header and a token in
  the URL leaks into logs.

## Iterations

Each one is a `/foc-iterate-feature notification-…` run.

| # | Iteration | Status |
|---|---|---|
| 0 | Contract proposal and shared-change plan (this document) | Done; approved 2026-11-04 |
| 1 | Service skeleton: Flyway V1, JWT validation, health, OpenAPI, notification list | Done |
| 2 | `credit.events` consumer: inbox, fingerprint, DLT; `CREDITS_*` notifications | Done |
| 2a | `read-api`: shared-contract list API with messages; `operationId` business key | Done (this change) |
| 3 | Shared wiring: Kafka user and ACLs, Compose, gateway, CI, Kubernetes, network policies | Next; by the nominated editor |
| 4 | `order-…`: Order publishes `OrderTransitioned` to `order.lifecycle.events` | After 0 and the topic from 3 |
| 5 | Order lifecycle consumer and recipient rules | After 4 |
| 6 | Read state: `PATCH /api/notifications/me/{id}/read`, unread count | After 1 |
| 7 | UI: Notifications page and polled bell badge; header links by each owner | After 3 and 6 |
| 8 | Retention job and monitoring (consumer lag, DLT count); server-sent events if time allows | After 2 and 5 |

## Verification

- **Every iteration:** `cd notification-service && ./mvnw -B verify` with JDK 17 and Docker running.
- **Handler:** each mapping, the IGNORED case, duplicates, the same `operationId` under a new
  `eventId` (`DUPLICATE_OPERATION`), `EVENT_ID_CONFLICT`, and every envelope or field violation
  rejected with nothing stored.
- **Read API:** the contract shape, each type's message, paging limits 1–100.
- **Kafka:** a published event becomes a notification, a redelivery stays at one row, and a
  rejected event reaches the DLT with its key and the `notification-service` group header.
- **Security:** `401` without a valid token, every role reads only its own `sub`, and other
  paths and methods are denied.
