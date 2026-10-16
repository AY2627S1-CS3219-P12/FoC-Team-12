# Order Service

Owned by XueTing. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities. The D3 roadmap is
[`IMPLEMENTATION_CHECKLIST.md`](IMPLEMENTATION_CHECKLIST.md).
The full lifecycle, transition and Kafka event design is in [`DESIGN.md`](DESIGN.md).

Spring Boot service (Java 17) that owns the order aggregate, its lifecycle, and
the order database. Runs on port `8082`.

## Authentication

All endpoints except `/actuator/health` and the OpenAPI/Swagger docs require a
`Bearer` JWT issued by the **User Service**. The service is a stateless OAuth2
resource server; it **validates** tokens but never issues them, following the
[User JWT contract](../user-service/README.md#login-and-jwt-verification).

- **Header:** `Authorization: Bearer <jwt>`.
- **Verification:** RS256 signature checked against the User Service public
  JWKS (`/.well-known/jwks.json`); `iss` must be `friend-on-campus-user-service`,
  `aud` must contain `friend-on-campus-api`, and `exp`/`nbf` must be valid.
- **Claims consumed:** `sub` → the caller's user UUID (the requester/courier
  identity); `role` → the single effective session role (`REQUESTER`, `COURIER`
  or `ADMIN`), mapped to `ROLE_<role>`.
- **Identity is taken only from `sub`.** It is never read from the request body
  or a header, so a client cannot impersonate another user by editing a field.
- **Rejections:** a missing, expired, bad-signature, wrong-issuer, wrong-audience,
  missing/unsupported-role, or non-UUID-`sub` token returns `401` RFC-7807
  `application/problem+json` with `WWW-Authenticate: Bearer`; a valid token whose
  session role is not permitted for the action returns `403`.

**Configuration** (no shared secret; only the public JWKS is needed):

| Property | Env var | Default |
| --- | --- | --- |
| `app.security.jwt.jwk-set-uri` | `ORDER_JWT_JWK_SET_URI` | `http://localhost:8081/.well-known/jwks.json` |
| `app.security.jwt.issuer` | `ORDER_JWT_ISSUER` | `friend-on-campus-user-service` |
| `app.security.jwt.audience` | `ORDER_JWT_AUDIENCE` | `friend-on-campus-api` |

The defaults suit a local run beside User Service. Whoever wires order-service
into `compose.yaml` (a shared-file task) should set `ORDER_JWT_JWK_SET_URI` to
`http://user-service:8081/.well-known/jwks.json`, as Supplier does.

## Create order

`POST /api/orders`

- **Auth:** `Bearer` JWT (see above) with session role `REQUESTER`; any other
  role gets `403`. The requester is the token's `sub`.
- **Body fields (client-supplied):**

  | Field | Rules |
  | --- | --- |
  | `title` | required, 1–120 chars (trimmed) |
  | `description` | required, 1–2000 chars (trimmed) |
  | `pickupLocationId` | required UUID (Supplier-owned) |
  | `dropoffLocationId` | required UUID, must differ from pickup |
  | `creditReward` | required integer, > 0 |
  | `pickupDeadline` | required, must be in the future (ISO-8601) |

- **Success:** `201 Created`, `Location: /api/orders/{id}`, body is the created
  order in state `PENDING_CREDIT`.
- **Validation failure:** `400` RFC-7807 `application/problem+json`. Field
  violations are collected under an `errors` map.
- **Unauthenticated:** `401` RFC-7807 `application/problem+json` (no `errors` map)
  when the bearer token is missing or invalid.
- **Forbidden:** `403` RFC-7807 `application/problem+json` when the token is valid
  but the session role is not `REQUESTER`.

## Read and cancel an order

| Endpoint | Who | Result |
| --- | --- | --- |
| `GET /api/orders/{id}` | Any signed-in user for an `OPEN` order; otherwise only the requester or assigned courier | `200` with the order, or `404` (`ORDER_NOT_FOUND`) so hidden orders are not revealed |
| `GET /api/orders/{id}/history` | The requester or assigned courier | `200` with every transition, oldest first |
| `POST /api/orders/{id}/cancel` | The requester, in a `REQUESTER` session | `200` with the cancelled order |

Cancelling an `OPEN` order releases the full reservation; cancelling an `ACCEPTED`
order clears the courier and asks Credit to compensate them. Repeating a cancel
returns the cancelled order without any further effect. Rejections are RFC-7807
problems with a `code` and the order's `currentState`:

| Code | Status | When |
| --- | --- | --- |
| `NOT_ORDER_REQUESTER` | 403 | The caller is not the order's requester |
| `CANCELLATION_NOT_ALLOWED` | 409 | The order is `PICKED_UP`, `DELIVERED` or `COMPLETED` |
| `INVALID_STATE_TRANSITION` | 409 | The action is not valid in the order's current state |
| `ORDER_NOT_FOUND` | 404 | No such order, or the caller may not see it |

Every state change also stores a history row (`order_transitions`) and an
`order.events` outbox row (`outbox_events`) in the same transaction, so a change
and its event are always saved together. The rows are not published yet; the
Kafka relay is a later iteration.

**Location names come from the client.** Order Service never calls Supplier
Service. The client picks locations from Supplier's public API and sends both the
IDs and the display names; Order validates their format and stores the names as
snapshots, so later Supplier edits or deletions don't rewrite existing errands.
Order does not check that a location exists or is active.

> Current state: create accepts the location IDs only, and the snapshot columns
> stay `NULL`. Adding the required `pickupLocationName`/`dropoffLocationName`
> fields (1–160 chars, trimmed) is the planned `order-location-snapshot`
> iteration in [`DESIGN.md`](DESIGN.md). The V1 snapshot columns stay nullable,
> so existing rows remain valid.

## Order events (contract)

Order Service events share a common envelope (`eventId`, `eventType`,
`eventVersion`, `aggregateType`, `aggregateId`, `aggregateVersion`, `occurredAt`,
`producer`, `correlationId`, `causationId`, `actor`, `data`). `aggregateVersion`
equals the order's `version` after the change so consumers can detect
missing/out-of-order events.

| Event | When |
| --- | --- |
| `OrderSubmitted` | after a valid order is stored as `PENDING_CREDIT` (Credit Service reserves the reward) |
| `OrderOpened` | after `CreditReserved`, `PENDING_CREDIT` → `OPEN` |
| `OrderReservationFailed` | after Credit Service rejects the reservation |
| `OrderUpdated` | when the requester edits an `OPEN` order without changing its reward |

Event **publishing** is not yet wired (no broker in `compose.yaml`); this
iteration persists to `PENDING_CREDIT` only. The planned transport is Kafka
(`order.events` / `credit.events`, keyed by `orderId`, through a transactional
outbox); the full event list and proposed contract are in [`DESIGN.md`](DESIGN.md).

## Lifecycle

Implemented so far (phase 1): creation, Credit's reservation outcome
(`PENDING_CREDIT → OPEN / EXPIRED / RESERVATION_FAILED`, called by the Kafka
consumer in a later iteration) and requester cancellation. Expiry, acceptance and
withdrawal come in phase 2; pickup, delivery and completion in phase 3. The table
below is the approved target; [`DESIGN.md`](DESIGN.md) has the full transition
table with guards, error codes, events and the iteration plan.

**R** = the order's requester (session role `REQUESTER`), **C** = the assigned
courier (session role `COURIER`), **Sys** = the expiry scheduler or a Credit reply.

| Current | Next | Actor | Guard | Credit effect | Event |
| --- | --- | --- | --- | --- | --- |
| — | PENDING_CREDIT | R | Valid fields; deadline in the future | Reserve the reward | `OrderSubmitted` |
| PENDING_CREDIT | OPEN | Sys | `CreditReserved` before the deadline | — | `OrderOpened` |
| PENDING_CREDIT | EXPIRED | Sys | `CreditReserved` at or after the deadline | Release in full | `OrderExpired` |
| PENDING_CREDIT | RESERVATION_FAILED | Sys | `CreditReservationRejected` | — | `OrderReservationFailed` |
| OPEN | OPEN (edit) | R | No reward adjustment pending; `version` matches | Adjust if the reward changed; the new reward applies only after `CreditAdjusted` | `OrderUpdated` / `OrderRewardChangeRequested` |
| OPEN | CANCELLED | R | — | Release in full, no compensation | `OrderCancelled` |
| OPEN | EXPIRED | Sys | `now >= pickupDeadline` | Release in full | `OrderExpired` |
| OPEN | ACCEPTED | C (any user except R) | Before the deadline; no reward adjustment pending; first request wins | — | `OrderAccepted` |
| ACCEPTED | OPEN | C | Withdraws before the deadline; courier cleared, back in the pool | — | `OrderReopened` |
| ACCEPTED | EXPIRED | C | Withdraws at or after the deadline; courier cleared | Release in full | `OrderExpired` |
| ACCEPTED | CANCELLED | R | Before pickup; courier cleared | Courier gets `ceil(reward × 20 / 100)`, the rest returns to R | `OrderCancelled` |
| ACCEPTED | PICKED_UP | C | Late pickup allowed | — | `OrderPickedUp` |
| PICKED_UP | DELIVERED | C | — | — | `OrderDelivered` |
| DELIVERED | COMPLETED | R | Confirms receipt | Full reward to C | `OrderCompleted` |

Rules that apply to every transition:

- **Deadline boundary:** an order is expired when `now >= pickupDeadline` (server
  clock, UTC). Only `OPEN` orders expire automatically, via the scheduler or
  lazily when an action touches an overdue order; accepted orders never do.
- **Terminal states:** `COMPLETED`, `CANCELLED`, `EXPIRED` and
  `RESERVATION_FAILED`. Cancellation and withdrawal are rejected with `409` once
  an order is `PICKED_UP` or later.
- **Concurrency:** each transition locks the order row, so the first request
  processed wins; the loser gets `409` (for example `ORDER_ALREADY_ACCEPTED`).
- **Duplicates:** repeating an action whose target state the order already has,
  by the same caller (for example a second `complete`), returns `200` with the
  current order and triggers no new event or credit effect.
- **Errors:** wrong session role or not the order's requester/courier → `403`;
  invalid state → `409`; malformed body → `400` with nothing changed.

## Build and test

```bash
./mvnw test          # unit, web and security tests, plus PostgreSQL integration tests
./mvnw verify        # full build
```

The persistence integration tests start a throwaway PostgreSQL with
Testcontainers, so **Docker must be running**. They apply the real Flyway
migrations.

Running the service needs a PostgreSQL database (`DB_HOST`/`DB_PORT`/`DB_NAME`/
`DB_USER`/`DB_PASSWORD`) and Compose wiring, which are shared root files added in
a follow-up.
