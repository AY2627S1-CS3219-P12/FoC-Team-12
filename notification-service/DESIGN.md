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
User Service ── JWKS ──► (token verification)│       │ GET /api/notifications (Bearer JWT)
                                                 UI ─► Gateway
```

- **Database per service.** Only Notification touches `notification-db`. It stores user and order
  UUIDs, never foreign keys into other services.
- **Consumer only.** Notification publishes nothing and calls no other service. The only
  synchronous outbound call is the JWKS fetch.
- **Reliability:** at-least-once delivery from Kafka, inbox de-duplication by `eventId`, and
  acknowledgement only after commit.

## What is stored, and what isn't

| Stored | Not stored |
| --- | --- |
| Who the notification is for (User UUID) | Emails, usernames, or any other profile data (User owns these) |
| What happened (type, order ID, a few values like the credit amount) | A copy of the order or the credit balance (Order and Credit own these) |
| Which event it came from (`eventId`, `correlationId`) | Tokens, passwords, or full event payloads |
| Whether it has been read (`read_at`) | The message text (built from a template when read, so wording can change later) |

## Data model

`V1__create_notifications.sql` (applied migrations are never edited). The columns and reasons are
in the [README](README.md#data-model). Differences from the first draft:

- **No foreign key from `notifications.source_event_id` to the inbox.** Inbox rows are pruned sooner
  than notifications, and the foreign key would block that. `UNIQUE (source_event_id, recipient_id)`
  still blocks a duplicate row.
- **No CHECK on `notifications.type`.** Java validates it, so a new type needs no migration.
  `notification_inbox.outcome` is checked (`NOTIFIED`, `IGNORED`).

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
| T1, T4, T5, T5a, T6 | nobody (the requester acted, or no one else is involved) | not published |

The courier gets two notifications for T11 and T14: `ORDER_CANCELLED` + `CREDITS_COMPENSATED`, and
`ORDER_COMPLETED` + `CREDITS_RECEIVED`. Proposal: keep both, so the lifecycle news is not delayed
by Credit. **To confirm with the team.**

## Proposed contract: `OrderTransitioned` on `order.lifecycle.events`

**Status: proposed, not approved.** Copy into the shared blueprint only after approval. Until then
nothing publishes or consumes it.

| Item | Proposal |
| --- | --- |
| Producer | Order Service (XueTing), through its existing transactional outbox |
| Consumer | Notification Service only, group `notification-service` |
| Topic | `order.lifecycle.events`, 3 partitions, 7-day retention; `order.lifecycle.events.DLT`, 1 partition, 30 days |
| Key | Order UUID, so one errand's events stay in order |
| Why a new topic | Credit rejects unknown event types on `order.events`, so adding them there would force a Credit change |
| Envelope | The blueprint's required envelope: `eventType` = `OrderTransitioned`, `aggregateType` = `Order`, `aggregateVersion` = the order version after the change, `producer` = `order-service`, the order's `correlationId`, `causationId` = the Credit outcome's `eventId` for T2, T2b, T3 and T5b, otherwise null, and `actor` |
| Operation identity | `eventId` only; there is no `operationId`, because no credit effect is requested |
| Duplicates | The Notification inbox ignores a repeated `eventId`. Order writes exactly one outbox row per applied transition and none for a duplicate request |
| Failure and retry | Order's outbox relay retries until Kafka acknowledges. Notification retries transient failures three times and then dead-letters; rejected events go straight to the DLT |
| Reconciliation | Notifications are informational, so a lost event means a missing notification, not a wrong balance. A DLT record can be replayed after it is fixed |
| Observability | Both sides log `eventId`, `eventType`, `correlationId` and outcome; DLT counts are monitored with the others |

`data`:

```json
{
  "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
  "transition": "T8",
  "action": "ACCEPT",
  "fromState": "OPEN",
  "toState": "ACCEPTED",
  "requesterId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
  "courierId": "5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10",
  "title": "Buy coffee",
  "creditReward": 3,
  "terminalReason": null,
  "occurredAt": "2026-10-30T09:15:00Z"
}
```

- `action` uses Order's history actions (`OPEN`, `FAIL_RESERVATION`, `ACCEPT`, `WITHDRAW`,
  `PICK_UP`, `DELIVER`, `COMPLETE`, `CANCEL`, `EXPIRE`, `REWARD_CHANGE_REJECTED`).
- **`courierId` is the courier before the change.** Withdrawal (T9, T10) and cancellation after
  acceptance (T11) clear the courier on the order, but the event must still name them so they can
  be told.
- `title` is a snapshot at the time of the change, so later edits don't rewrite past
  notifications.

## Proposed shared changes (awaiting approval)

Each shared file has one nominated editor and needs review from the affected owners
([root AGENTS.md](../AGENTS.md)). Nothing below is changed by iterations 0–2.

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
- `GET /api/notifications` returns stored rows from iteration 1 on.
- The requester gets no notification for `CourierCompensated`.

To confirm with the team:
1. A separate `order.lifecycle.events` topic (recommended) rather than more events on `order.events`.
2. Whether the courier keeps both notifications for T11 and T14.
3. **Retention.** Proposal: delete read notifications after 30 days and every notification after
   90 days. Keep inbox rows **at least 30 days**: DLT topics retain records for 30 days, so a
   replay after the inbox row was pruned would notify twice.
4. Where the bell lives: in all four headers, or only a Notifications page linked from the main page.

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
| 0 | Contract proposal and shared-change plan (this document) | Done (this change); approvals pending |
| 1 | Service skeleton: Flyway V1, JWT validation, health, OpenAPI, `GET /api/notifications` | Done (this change) |
| 2 | `credit.events` consumer: inbox, fingerprint, DLT; `CREDITS_*` notifications | Done (this change) |
| 3 | Shared wiring: Kafka user and ACLs, Compose, gateway, CI, Kubernetes, network policies | Next; needs the approvals above |
| 4 | `order-…`: Order publishes `OrderTransitioned` to `order.lifecycle.events` | After 0 and the topic from 3 |
| 5 | Order lifecycle consumer and recipient rules | After 4 |
| 6 | Read API: message text, unread count, mark one or all read | After 1 |
| 7 | UI: Notifications page and polled bell badge; header links by each owner | After 3 and 6 |
| 8 | Retention job and monitoring (consumer lag, DLT count); server-sent events if time allows | After 2 and 5 |

## Verification

- **Every iteration:** `cd notification-service && ./mvnw -B verify` with JDK 17 and Docker running.
- **Handler:** each mapping, the IGNORED case, duplicates, `EVENT_ID_CONFLICT`, and every envelope
  or field violation rejected with nothing stored.
- **Kafka:** a published event becomes a notification, a redelivery stays at one row, and a
  rejected event reaches the DLT with its key and the `notification-service` group header.
- **Security:** `401` without a valid token, every role reads only its own `sub`, and other
  paths and methods are denied.
