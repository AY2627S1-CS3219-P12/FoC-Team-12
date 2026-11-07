# Notification Service

Owned by **XueTing**. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities. The design, iteration plan and
the planned shared changes are in [`DESIGN.md`](DESIGN.md). Shared proposed wire shapes
and fixtures: [contract package](../docs/contracts/README.md). Source: D3 presentation slides 2-5,
D1 N2H3.

Spring Boot service (Java 17) that turns other services' Kafka events into per-user notifications
and owns the notification database. Runs on port `8086`. **Status:** the read API, read marking
with the unread count and the `credit.events` consumer are built and tested, and the service runs
in Compose behind the gateway with its own Kafka identity and a CI job. Order lifecycle
notifications, the UI and Kubernetes are not yet. The latest Kubernetes default-deny policies do not yet allow Notification
traffic; its deployment iteration must add Gateway ingress and DB/User-JWKS/Kafka egress plus
matching destination ingress (see the contract package's deployment matrix). Its broker ACLs
already exist.

## Purpose and boundary

Provide private, durable in-app notifications about successful Order/Credit outcomes. Consume
events, store one intended notification per recipient/business outcome, and serve that user's
history. Do not change orders, calculate credits, send verification emails, store chats or inspect
other databases. No email/push/SMS delivery, Admin-case notifications or translation in this scope.
In-app only means there is no external provider to fail, so there is no channel fallback: the
stored notification waits until the user next opens the app ([DESIGN.md](DESIGN.md#fallback)).

Browser -> Gateway -> Notification HTTP API. Order/Credit -> Kafka -> Notification private
PostgreSQL database. A notification confirms a committed source fact, not an attempted action.
It must not imply that credits were released before Credit confirms its operation.

## Authentication

All endpoints except `/actuator/health` and the OpenAPI docs require a `Bearer` JWT issued by the
**User Service**, verified exactly as Order Service does (see the
[User JWT contract](../user-service/README.md#login-and-jwt-verification)): RS256 against the
published JWKS, `iss` = `friend-on-campus-user-service`, `aud` contains `friend-on-campus-api`,
valid `exp`/`nbf`, a supported `role` and a UUID `sub`.

- **The recipient is the token's `sub`.** No parameter, header or body field can name another user,
  and there is no admin endpoint for all users' notifications.
- **Any session role may read** (`REQUESTER`, `COURIER` or `ADMIN`): notifications belong to the
  account, so switching role keeps both kinds visible. An admin reads only their own.
- **Rejections:** a missing or invalid token returns `401` RFC-7807 `application/problem+json`
  with `WWW-Authenticate: Bearer`. Any method or path outside the API below returns `403`; see
  [Errors](#errors).

| Property | Env var | Default |
| --- | --- | --- |
| `app.security.jwt.jwk-set-uri` | `NOTIFICATION_JWT_JWK_SET_URI` | `http://localhost:8081/.well-known/jwks.json` |
| `app.security.jwt.issuer` | `NOTIFICATION_JWT_ISSUER` | `friend-on-campus-user-service` |
| `app.security.jwt.audience` | `NOTIFICATION_JWT_AUDIENCE` | `friend-on-campus-api` |

## List my notifications

`GET /api/notifications/me?page=&size=` (shared contract operation
`notification_get__api_notifications_me` in [n2h.openapi.json](../docs/contracts/n2h.openapi.json))

- `page` is zero-based (default `0`); `size` is 1–100 (default `20`). A malformed or out-of-range
  value returns `400` with `code` = `INVALID_QUERY`.
- Newest first by `occurredAt`, when the fact happened, not when it was stored, so events caught up
  after downtime still appear in real-time order; the notification ID breaks ties so pages never
  overlap. Pagination does not imply a 100-record storage cap.
- **Success:** `200` with the page:

```json
{
  "content": [
    {
      "id": "0f8b7d2e-4c1a-4a8e-9f33-1d2c3b4a5e6f",
      "type": "CREDITS_RECEIVED",
      "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
      "message": "You received 3 credits for completing an errand.",
      "occurredAt": "2026-10-30T09:15:00Z",
      "readAt": null
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

`orderId` is the errand to link to (`/errands/{orderId}`), or `null` for account-level
notifications; the link grants no access by itself, Order still authorizes the errand page.
`readAt` is `null` until the user marks it read. The message is built when read from the stored
type and template values, so wording can change without rewriting past notifications:

| `type` | `message` |
| --- | --- |
| `CREDITS_WELCOME` | Welcome! You received {n} credits to get started. |
| `CREDITS_RECEIVED` | You received {n} credits for completing an errand. |
| `CREDITS_COMPENSATED` | You received {n} credits as compensation for a cancelled errand. |

`{n} credits` reads `1 credit` for one.

## Mark one read

`PATCH /api/notifications/me/{id}/read` (shared contract operation
`notification_patch__api_notifications_me_id_read`), no request body.

- **Success:** `200` with the notification in the same shape as a list entry, with `readAt` set.
- **Idempotent:** the first call sets `readAt` to the server time; repeating it returns the same
  notification with the original `readAt`. Concurrent calls all return the first `readAt`.
- **Not yours or missing:** `404` with `code` = `NOTIFICATION_NOT_FOUND`. Another user's notification
  is reported exactly like a missing one and is left unchanged.
- **Malformed ID:** `400` with `code` = `INVALID_ID`.

There is no mark-all-read or mark-unread operation.

## Unread count

`GET /api/notifications/me/unread-count` (shared contract operation
`notification_get__api_notifications_me_unread_count`, schema `UnreadCount`) returns `200` with
`{"unreadCount": 3}`: the caller's notifications with no `readAt`, for the bell badge. Served by
the partial index `ix_notifications_recipient_unread`.

## Errors

All errors are RFC-7807 `application/problem+json`.

| `code` | Status | When |
| --- | --- | --- |
| `INVALID_QUERY` | 400 | A malformed or out-of-range `page` or `size` |
| `INVALID_ID` | 400 | A notification ID that is not a UUID |
| `NOTIFICATION_NOT_FOUND` | 404 | No such notification for the caller, including another user's |
| — | 401 | Missing or invalid bearer token (`WWW-Authenticate: Bearer`) |
| — | 403 | Any method or path outside this API |

## Proposed UI

Not built (iteration 7). Notification UI lives in the Notification-owned area and uses same-origin
gateway APIs. List loading/empty/error/expired-session states and links to authorized errand pages.
Proposed UI path `/notifications`; optional badge/read controls require explicit scope approval in
feature analysis. Polling is sufficient initially; WebSocket delivery is not required by the D3
notification plan (see [DESIGN.md](DESIGN.md#decisions) for why push is deferred). No browser code
or untrusted notification link grants access to an order.

## Notifications from Credit events

The service consumes `credit.events` as group `notification-service`, using the shared
[event communication blueprint](../docs/integration/event-communication-blueprint.md) envelope.
It never shares Order, Credit or Chat consumer groups.

| Credit event | Recipient | `type` | `orderId` | Template value |
| --- | --- | --- | --- | --- |
| `CreditAccountAllocated` | `data.userId` | `CREDITS_WELCOME` | `null` | `amount` = `allocatedAmount` |
| `CreditSettled` | `data.courierId` | `CREDITS_RECEIVED` | `data.orderId` | `amount` = `transferredAmount` |
| `CourierCompensated` | `data.courierId` | `CREDITS_COMPENSATED` | `data.orderId` | `amount` = `transferredAmount` |
| Any other type | nobody | — | — | inbox row `IGNORED` |

The requester is not told about `CourierCompensated`: they cancelled, and the actor is never
notified. Credit ledger amounts come from Credit; `CREDITS_RECEIVED`/`COMPENSATED` are never
generated from Order state alone.

**Processing, in one transaction:**

1. Parse the event. `eventId`, `eventType`, `aggregateId` and `correlationId` are required and
   `producer` must be `credit-service`. For the three events above, `eventVersion` must be `1`,
   `aggregateType` must be `User` (allocation) or `Order`, `aggregateId` must equal
   `data.userId`/`data.orderId`, `occurredAt` must be ISO-8601, the recipient and `operationId`
   must be UUIDs and the amount a positive whole number.
2. Look up the inbox (`notification_inbox`) by `eventId`. The same content again is a duplicate and
   changes nothing; the same `eventId` with different content is rejected as `EVENT_ID_CONFLICT`.
3. Look up the business key: recipient, type and `operationId`. Credit gives each outcome a fresh
   `eventId`, even when it reprocesses an operation it already applied, so a reconciliation replay
   arrives as a new event. If this recipient was already notified for this operation, no second
   notification is stored and the inbox row is `DUPLICATE_OPERATION` (logged as a warning if the
   values differ).
4. Insert the notification (if any) and the inbox row (`NOTIFIED`, `IGNORED` or
   `DUPLICATE_OPERATION`), then commit. The listener acknowledges Kafka only after the commit.

**Failures:** a rejected event (`INVALID_EVENT` or `EVENT_ID_CONFLICT`) stores nothing, is logged
with its `eventId`, `eventType`, `correlationId` and reason, and goes straight to
`credit.events.DLT` without retries. Any other failure (for example the database is down) is
retried three times with backoff and then goes to the DLT. Dead letters keep the original key and
carry Spring's headers naming the `notification-service` group and the exception, which tells them
apart from Order's dead letters on the same topic. A valid unhandled fact is acknowledged as
`IGNORED`; invalid event types or versions never silently disappear.

`NOTIFICATION_KAFKA_ENABLED=false` runs the service without a broker; nothing is then consumed.

| Property | Env var | Default |
| --- | --- | --- |
| `spring.kafka.bootstrap-servers` | `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092` |
| `spring.kafka.security.protocol` | `KAFKA_SECURITY_PROTOCOL` | `SASL_PLAINTEXT` |
| `spring.kafka.properties.sasl.mechanism` | `KAFKA_SASL_MECHANISM` | `PLAIN` |
| Kafka username / password | `KAFKA_USERNAME` / `KAFKA_PASSWORD` | `notification_service` / empty |

## Order lifecycle notifications (planned)

Not built. Read the [core event blueprint](../docs/integration/event-communication-blueprint.md)
and [Chat/Order lifecycle proposal](../docs/integration/chat-admin-contract.md#event-coverage-and-persistence).
Core `order.events` alone does not include acceptance/pickup/delivery: current OrderEventRecorder
publishes only the five core credit-driving events. Full lifecycle production is an Order-owned
iteration that must land before notification integration is claimed complete. Do not invent
events by polling Order's DB.

The Order-owned lifecycle schema is agreed once for both Chat and Notifications: `OrderTransitioned`
on proposed `order.lifecycle.events`, as in
[n2h-events.schema.json](../docs/contracts/n2h-events.schema.json). It carries stable
`eventId`/`orderId`, `sourceSequence`, `requesterId`, `previousCourierId`/`courierId`,
`fromState`/`toState`, `action`, `reasonCode` and `snapshot`; recipient IDs are preserved when
cancellation/withdrawal clears the live assignment. Both consumers reuse the same versioned schema
and fixtures and do not rename fields. [DESIGN.md](DESIGN.md#proposed-contract-ordertransitioned-on-orderlifecycleevents)
has the details, including the `sourceSequence` rules.

| Notification type | Source/condition | Recipient | Message intent |
| --- | --- | --- | --- |
| `ORDER_OPENED` | `PENDING_CREDIT -> OPEN` | Requester | Errand is live |
| `ORDER_RESERVATION_FAILED` | `-> RESERVATION_FAILED` | Requester | Creation failed; show safe approved reason |
| `ORDER_ACCEPTED` | `OPEN -> ACCEPTED` | Requester | Courier accepted |
| `ORDER_COURIER_WITHDREW` | `ACCEPTED -> OPEN` | Requester | Courier withdrew; errand returned to pool |
| `ORDER_EXPIRED` | `-> EXPIRED` | Requester | Errand expired; credit release may still be pending |
| `ORDER_CANCELLED` | `ACCEPTED -> CANCELLED` | Previous assigned courier | Requester cancelled |
| `ORDER_PICKED_UP` | `-> PICKED_UP` | Requester | Item picked up |
| `ORDER_DELIVERED` | `-> DELIVERED` | Requester | Delivered; confirm receipt |
| `ORDER_COMPLETED` | `-> COMPLETED` | Courier | Requester confirmed receipt |

Safe rejection codes come from Credit; Order reason details must be explicitly added to its agreed
snapshot if absent. Ignore valid source events outside this table. Unsupported schema or missing
required recipients is a recoverable contract failure, not a notification to an arbitrary user.
OPEN cancellation does not notify a nonexistent courier. Additional rows require approval. The
business key is `orderId:sourceSequence`, so two genuine reopen/accept cycles stay distinct.

## Data model and delivery guarantees

Flyway `V1__create_notifications.sql` (tables) and `V2__retention_indexes.sql` (indexes for the
retention job). Applied migrations are never edited; changes go in a new migration.

- **`notification_inbox`**: `event_id` (primary key), `topic`, `event_type`, `aggregate_id`,
  `correlation_id`, `fingerprint` (SHA-256 of the envelope), `outcome`
  (`NOTIFIED`/`IGNORED`/`DUPLICATE_OPERATION`), `processed_at`.
- **`notifications`**: `id` (opaque UUID), `recipient_id`, `type`, `order_id`, `params` (JSONB
  template values), `source_event_id`, `business_key`, `occurred_at`, `created_at`, `read_at`
  (null = unread). `UNIQUE (recipient_id, type, business_key)` enforces one notification per
  business outcome; `UNIQUE (source_event_id, recipient_id)` is a second guard. There is no foreign
  key to the inbox, so inbox rows can be pruned sooner than notifications.

Inbox and notifications commit atomically before the Kafka ack, so a crash after commit or a source
replay creates no second logical notification. Past delayed facts are retained rather than
discarded on a generic "older version" check, and gaps are never treated as permission to guess
transitions. No profile data, balances, tokens or full event payloads are stored, and the API never
returns another user's data.

**Retention** (approved, [DESIGN.md](DESIGN.md#decisions)), enforced by a job every hour:

| Rule | Deleted when | Default |
| --- | --- | --- |
| Read notifications | `read_at` is more than the period ago | 30 days |
| Every notification, read or not | `created_at` is more than the period ago | 90 days |
| `notification_inbox` rows | `processed_at` is more than the period ago | 30 days |

A row exactly at the limit is kept. The inbox period can never be set below 30 days, the DLT
replay window, so deduplication data always outlives a replayable record: startup fails instead.
Each rule deletes in batches, each in its own short transaction, choosing rows with
`FOR UPDATE SKIP LOCKED`, so several instances can run it at once without waiting on or
double-counting each other. Each run logs one line with the three counts and its duration.

| Setting | Env var | Default |
| --- | --- | --- |
| Turn the job off | `NOTIFICATION_RETENTION_ENABLED` | `true` |
| Read notifications | `NOTIFICATION_RETENTION_READ` | `30d` |
| Every notification | `NOTIFICATION_RETENTION_ALL` | `90d` |
| Inbox rows (minimum `30d`) | `NOTIFICATION_RETENTION_INBOX` | `30d` |
| Batch size (1–10000) | `NOTIFICATION_RETENTION_BATCH_SIZE` | `500` |
| Interval | `NOTIFICATION_RETENTION_INTERVAL_MS` | `3600000` (one hour; the first run is a minute after startup) |

## NFRs and acceptance

D3 NF1: at least 99% valid retrieval success over a 30-minute normal-load run; separately classify
unrelated auth/gateway/dependency failures and retain observable outcomes. D3 NF2: for a user with
up to 100 stored notifications, P95 retrieval <=2 seconds, measured request receipt to returned
data, not event-processing time. Agree/record normal-load concurrency and hardware before testing;
these slides do not specify them. Do not invent a 2,000-user commitment.

Automated (built so far): each Credit mapping and message, unrelated-recipient denial, redelivery,
same operation under a new event ID, `EVENT_ID_CONFLICT`, invalid schema -> DLT, paging limits,
token contract and role access, idempotent and concurrent read marking, and the unread count. Still to add with later iterations: Order mapping fixtures,
repeated acceptance cycles, out-of-order delivery, concurrent consumption, DB restart, safe reason
rendering and no credentials in logs. Manual real-broker (after the shared wiring):
create/accept/withdraw/pickup/deliver/complete, rejected reservation, expiry, cancellation
compensation, independent two-user notification histories, consumer outage/replay.

## Run with Docker Compose

Notification Service and its private database (`notification-db`, host port `127.0.0.1:5437`) are
part of the root `compose.yaml`. Put `NOTIFICATION_DB_NAME`, `NOTIFICATION_DB_USER`,
`NOTIFICATION_DB_PASSWORD` and `KAFKA_NOTIFICATION_SERVICE_PASSWORD` in the root `.env` (see
`.env.example`); Compose also requires the other services' variables. Then:

```bash
docker compose up -d --build notification-service gateway
```

The service listens on `127.0.0.1:8086` (override with `NOTIFICATION_HOST_PORT`) and is reached
through the gateway at `http://localhost:8088/api/notifications/**`. It verifies tokens with User
Service's JWKS inside the Compose network and consumes `credit.events` as Kafka identity
`notification_service`, group `notification-service`. The gateway does not wait for it, so
`/api/notifications/**` returns a gateway error until it is up.

## Run locally

To run it outside Compose, use your own PostgreSQL database:

```bash
DB_HOST=localhost DB_PORT=5432 DB_NAME=notification_db DB_USER=... DB_PASSWORD=... \
NOTIFICATION_KAFKA_ENABLED=false ./mvnw spring-boot:run
```

To consume the Compose broker from the host instead, set `KAFKA_BOOTSTRAP_SERVERS=localhost:29092`,
`KAFKA_PASSWORD` to `KAFKA_NOTIFICATION_SERVICE_PASSWORD` and leave `NOTIFICATION_KAFKA_ENABLED` on.

## Build and test

```bash
./mvnw test          # unit, web and security tests, plus PostgreSQL and Kafka integration tests
./mvnw verify        # full build
```

The integration tests start a throwaway PostgreSQL and Kafka with Testcontainers, so **Docker must
be running**. They apply the real Flyway migration.

## Handoffs

XueTing owns the consumer, inbox and mapping, and Notification's Kafka (identity, ACLs, topics, DLTs,
broker credentials), Kubernetes and Compose/CI wiring, checked with `compose_env_check`. XueTing also
implements Order lifecycle producer coverage in Order. Eldridge approves Credit payloads; no
financial changes belong here. Darryl edits the shared contract package. Existing Admin case
notifications remain deferred.
