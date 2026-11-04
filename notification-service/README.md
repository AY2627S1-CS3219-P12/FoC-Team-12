# Notification Service

Owned by XueTing. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities. The design, iteration plan and
the shared changes awaiting approval are in [`DESIGN.md`](DESIGN.md).

Spring Boot service (Java 17) that turns other services' Kafka events into per-user notifications
and owns the notification database. Runs on port `8084`.

## Authentication

All endpoints except `/actuator/health` and the OpenAPI docs require a `Bearer` JWT issued by the
**User Service**, verified exactly as Order Service does (see the
[User JWT contract](../user-service/README.md#login-and-jwt-verification)): RS256 against the
published JWKS, `iss` = `friend-on-campus-user-service`, `aud` contains `friend-on-campus-api`,
valid `exp`/`nbf`, a supported `role` and a UUID `sub`.

- **The recipient is the token's `sub`.** No parameter, header or body field can name another user.
- **Any session role may read** (`REQUESTER`, `COURIER` or `ADMIN`): notifications belong to the
  account, so switching role keeps both kinds visible. An admin reads only their own.
- **Rejections:** a missing or invalid token returns `401` RFC-7807 `application/problem+json`
  with `WWW-Authenticate: Bearer`. Any method or path outside the API below returns `403`.

| Property | Env var | Default |
| --- | --- | --- |
| `app.security.jwt.jwk-set-uri` | `NOTIFICATION_JWT_JWK_SET_URI` | `http://localhost:8081/.well-known/jwks.json` |
| `app.security.jwt.issuer` | `NOTIFICATION_JWT_ISSUER` | `friend-on-campus-user-service` |
| `app.security.jwt.audience` | `NOTIFICATION_JWT_AUDIENCE` | `friend-on-campus-api` |

## List my notifications

`GET /api/notifications?page=&size=`

- `page` is zero-based (default `0`); `size` is 1–50 (default `20`). A malformed or out-of-range
  value returns `400` with `code` = `INVALID_QUERY`.
- Newest first by `occurredAt`, when the fact happened, not when it was stored, so events caught up
  after downtime still appear in real-time order.
- **Success:** `200` with the page:

```json
{
  "items": [
    {
      "id": "0f8b7d2e-4c1a-4a8e-9f33-1d2c3b4a5e6f",
      "type": "CREDITS_RECEIVED",
      "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
      "params": { "amount": 3 },
      "occurredAt": "2026-10-30T09:15:00Z",
      "read": false
    }
  ],
  "page": 0,
  "size": 20,
  "totalItems": 1,
  "totalPages": 1
}
```

`orderId` is the errand to link to (`/errands/{orderId}`), or `null` for account-level
notifications. The message text, unread count and marking as read come in a later iteration; see
[DESIGN.md](DESIGN.md#iterations).

## Notifications from Credit events

The service consumes `credit.events` as group `notification-service`, using the shared
[event communication blueprint](../docs/integration/event-communication-blueprint.md) envelope.

| Credit event | Recipient | `type` | `orderId` | `params` |
| --- | --- | --- | --- | --- |
| `CreditAccountAllocated` | `data.userId` | `CREDITS_WELCOME` | `null` | `amount` = `allocatedAmount` |
| `CreditSettled` | `data.courierId` | `CREDITS_RECEIVED` | `data.orderId` | `amount` = `transferredAmount` |
| `CourierCompensated` | `data.courierId` | `CREDITS_COMPENSATED` | `data.orderId` | `amount` = `transferredAmount` |
| Any other type | nobody | — | — | inbox row `IGNORED` |

The requester is not told about `CourierCompensated`: they cancelled, and the actor is never
notified. Their own errand notifications come from Order's lifecycle events (a later iteration).

**Processing, in one transaction:**

1. Parse the event. `eventId`, `eventType`, `aggregateId` and `correlationId` are required and
   `producer` must be `credit-service`. For the three events above, `eventVersion` must be `1`,
   `aggregateType` must be `User` (allocation) or `Order`, `aggregateId` must equal
   `data.userId`/`data.orderId`, `occurredAt` must be ISO-8601, the recipient must be a UUID and
   the amount a positive whole number.
2. Look up the inbox (`notification_inbox`) by `eventId`. The same content again is a duplicate and
   changes nothing; the same `eventId` with different content is rejected as `EVENT_ID_CONFLICT`.
3. Insert the notification (if any) and the inbox row (`NOTIFIED` or `IGNORED`), then commit.
   The listener acknowledges Kafka only after the commit.

**Failures:** a rejected event (`INVALID_EVENT` or `EVENT_ID_CONFLICT`) stores nothing, is logged
with its `eventId`, `eventType`, `correlationId` and reason, and goes straight to
`credit.events.DLT` without retries. Any other failure (for example the database is down) is
retried three times with backoff and then goes to the DLT. Dead letters keep the original key and
carry Spring's headers naming the `notification-service` group and the exception, which tells them
apart from Order's dead letters on the same topic.

`NOTIFICATION_KAFKA_ENABLED=false` runs the service without a broker; nothing is then consumed.

| Property | Env var | Default |
| --- | --- | --- |
| `spring.kafka.bootstrap-servers` | `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092` |
| `spring.kafka.security.protocol` | `KAFKA_SECURITY_PROTOCOL` | `SASL_PLAINTEXT` |
| `spring.kafka.properties.sasl.mechanism` | `KAFKA_SASL_MECHANISM` | `PLAIN` |
| Kafka username / password | `KAFKA_USERNAME` / `KAFKA_PASSWORD` | `notification_service` / empty |

## Data model

Flyway `V1__create_notifications.sql`; applied migrations are never edited.

- **`notification_inbox`** (inbox): `event_id` (primary key), `topic`, `event_type`,
  `aggregate_id`, `correlation_id`, `fingerprint` (SHA-256 of the envelope), `outcome`
  (`NOTIFIED`/`IGNORED`), `processed_at`.
- **`notifications`**: `id`, `recipient_id`, `type`, `order_id`, `params` (JSONB template values),
  `source_event_id`, `occurred_at`, `created_at`, `read_at` (null = unread).
  `UNIQUE (source_event_id, recipient_id)` is a second guard against duplicates. There is no
  foreign key to the inbox, so inbox rows can be pruned sooner than notifications.

## Run locally

The service is not in `compose.yaml`, the gateway, Kubernetes or CI yet; that shared wiring is
[iteration 3](DESIGN.md#proposed-shared-changes-awaiting-approval). To run it beside the Compose
stack, use your own PostgreSQL database:

```bash
DB_HOST=localhost DB_PORT=5432 DB_NAME=notification_db DB_USER=... DB_PASSWORD=... \
NOTIFICATION_KAFKA_ENABLED=false ./mvnw spring-boot:run
```

Consuming the shared broker needs the `notification_service` Kafka identity and ACLs, which are
part of iteration 3.

## Build and test

```bash
./mvnw test          # unit, web and security tests, plus PostgreSQL and Kafka integration tests
./mvnw verify        # full build
```

The integration tests start a throwaway PostgreSQL and Kafka with Testcontainers, so **Docker must
be running**. They apply the real Flyway migration.
