# Order Service

Owned by XueTing. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities. The D3 roadmap is
[`IMPLEMENTATION_CHECKLIST.md`](IMPLEMENTATION_CHECKLIST.md).
The full lifecycle, transition and Kafka event design is in [`DESIGN.md`](DESIGN.md).

Spring Boot service (Java 17) that owns the order aggregate, its lifecycle, and
the order database. Runs on port `8082`.

## Authentication

Local cluster setup: [Kubernetes deployment](k8s/README.md).

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
  | `pickupLocationName` | required, 1–160 chars (trimmed); the name Supplier shows |
  | `dropoffLocationId` | required UUID, must differ from pickup |
  | `dropoffLocationName` | required, 1–160 chars (trimmed) |
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

## Edit an order

`PATCH /api/orders/{id}`

- **Auth:** session role `REQUESTER` (any other role gets `403`), and the caller
  must be the order's requester.
- **Body:** a full replacement. Every editable field is required, with the same
  rules as [Create order](#create-order) (`title`, `description`,
  `pickupLocationId` + `pickupLocationName`, `dropoffLocationId` +
  `dropoffLocationName`, `creditReward`, `pickupDeadline` in the future), plus
  `version`: the order `version` the client last read (integer ≥ 0).
- **Allowed only while `OPEN`** and no reward change is pending.
- **Details only** (reward unchanged): applied at once, recorded in the history
  as `EDIT`; no event is published.
- **Reward changed:** the other fields apply at once, but `creditReward` stays as
  it was and the new value is stored as `pendingCreditReward`. Order writes one
  `OrderRewardChangeRequested` (`operationId`, `orderId`, `newCreditReward`) and
  the new reward applies **only after Credit confirms** with `CreditAdjusted`
  (history `REWARD_CHANGE_APPLIED`). If Credit answers
  `CreditAdjustmentRejected` (for example `INSUFFICIENT_CREDITS`), the old reward
  stays and the pending value is cleared (history `REWARD_CHANGE_REJECTED`, which
  the client can show as "insufficient credits"). While a change is pending the
  order can't be accepted or edited (`409 REWARD_ADJUSTMENT_PENDING`), but it can
  still be cancelled; cancelling or expiring clears the pending value, and a Credit
  answer that arrives afterwards is recorded but changes nothing.
- **Duplicates:** resending exactly what the order already holds (a pending
  reward counts as the reward) returns `200` with the order unchanged, whatever
  `version` it carries, so a network retry is safe.
- **Checks, in order:** role (`403`) → order exists and is visible (`404`) → an
  overdue `OPEN` order is expired and the edit rejected (`409 ORDER_EXPIRED`) →
  caller is the requester (`403 NOT_ORDER_REQUESTER`) → state is `OPEN`
  (`409 INVALID_STATE_TRANSITION`) → duplicate (`200`) → no pending reward change
  (`409 REWARD_ADJUSTMENT_PENDING`) → `version` matches (`409 VERSION_CONFLICT`,
  with `currentVersion`; reload and retry).
- **Success:** `200` with the order; `version` increases on every applied edit.

## Read and act on an order

| Endpoint | Who | Result |
| --- | --- | --- |
| `GET /api/orders/{id}` | Any signed-in user for an `OPEN` order; otherwise only the requester or assigned courier | `200` with the order, or `404` (`ORDER_NOT_FOUND`) so hidden orders are not revealed |
| `GET /api/orders/{id}/history` | The requester or assigned courier | `200` with every transition, oldest first |
| `POST /api/orders/{id}/cancel` | The requester, in a `REQUESTER` session | `200` with the cancelled order |
| `POST /api/orders/{id}/accept` | Any courier except the requester, in a `COURIER` session | `200` with the accepted order |
| `POST /api/orders/{id}/withdraw` | The assigned courier, in a `COURIER` session | `200` with the reopened or expired order |
| `POST /api/orders/{id}/pickup` | The assigned courier, in a `COURIER` session | `200` with the order in `PICKED_UP` |
| `POST /api/orders/{id}/deliver` | The assigned courier, in a `COURIER` session | `200` with the order in `DELIVERED` |
| `POST /api/orders/{id}/complete` | The requester, in a `REQUESTER` session | `200` with the order in `COMPLETED` |

Cancelling an `OPEN` order releases the full reservation; cancelling an `ACCEPTED`
order clears the courier and asks Credit to compensate them. If several couriers
accept at once, only the first one processed wins. A courier who withdraws before
the pickup deadline puts the order back in the pool; withdrawing at or after the
deadline expires it instead. The courier then picks up and delivers the item
(a late pickup after the deadline is allowed), and the requester confirms
receipt, which settles the full reward to the courier. Repeating an action you
already made (for example a second `complete` after a network retry) returns the
order without any further effect, so the reward is never settled twice.

**Expiry:** an `OPEN` order expires once `now >= pickupDeadline`. A background job
does this every 30 s (`ORDER_EXPIRY_INTERVAL_MS`; turn it off with
`ORDER_EXPIRY_ENABLED=false`), and any action on an overdue `OPEN` order expires
it first and is rejected with `ORDER_EXPIRED`. Accepted orders never expire. Rejections are RFC-7807
problems with a `code` and the order's `currentState`:

| Code | Status | When |
| --- | --- | --- |
| `NOT_ORDER_REQUESTER` | 403 | The caller is not the order's requester |
| `CANCELLATION_NOT_ALLOWED` | 409 | Cancel or withdraw when the order is `PICKED_UP`, `DELIVERED` or `COMPLETED` |
| `NOT_ASSIGNED_COURIER` | 403 | The caller is not the order's assigned courier |
| `SELF_ACCEPTANCE_FORBIDDEN` | 403 | The requester tried to accept their own order |
| `ORDER_ALREADY_ACCEPTED` | 409 | Another courier accepted the order first |
| `ORDER_EXPIRED` | 409 | The pickup deadline has passed |
| `INVALID_STATE_TRANSITION` | 409 | The action is not valid in the order's current state |
| `ORDER_NOT_FOUND` | 404 | No such order, or the caller may not see it |
| `REWARD_ADJUSTMENT_PENDING` | 409 | Accept or edit while a reward change awaits Credit |
| `VERSION_CONFLICT` | 409 | Edit based on an old `version`; the problem carries `currentVersion` |
| `INVALID_QUERY` | 400 | A list endpoint got an invalid filter, sort or paging value (no `currentState`) |

Every state change also stores an `order_transitions`
history row in the same transaction; credit-changing ones also store an
`order.events` outbox row (`outbox_events`), so a change and its event are
always saved together. See [Order events](#order-events-contract).

**Location names come from the client.** Order Service never calls Supplier
Service. The client picks locations from Supplier's public API and sends both the
IDs and the display names; Order validates their format and stores the names as
snapshots (`pickup_location_name_snapshot`, `dropoff_location_name_snapshot`), so
later Supplier edits or deletions don't rewrite existing errands. Order does not
check that a location exists or is active. Orders created before this change have
no stored names (the columns stay nullable).

## Browse open orders and history

Any signed-in session role may call these; the caller is the token's `sub`. Each
returns a page:

```json
{ "items": [ /* orders, same shape as GET /api/orders/{id} */ ],
  "page": 0, "size": 20, "totalItems": 21, "totalPages": 2 }
```

| Endpoint | Returns | Order |
| --- | --- | --- |
| `GET /api/orders` | The open pool: `OPEN` orders whose `pickupDeadline` is still in the future, with no reward change pending, excluding the caller's own requests (F4.1) | `sort` below |
| `GET /api/orders/me/requested` | The caller's own orders (F9.1). `status=past` (default): `COMPLETED`, `CANCELLED` or `EXPIRED`. `status=active`: `PENDING_CREDIT`, `OPEN`, `ACCEPTED`, `PICKED_UP` or `DELIVERED`. `RESERVATION_FAILED` is never listed (the errand was not posted) | Past: latest state change first. Active: nearest pickup deadline first. Then `id` |
| `GET /api/orders/admin/users/{userId}/requested` | **ADMIN session only.** Read-only support view of that user's requests, same `status`/`state`/paging rules as `/me/requested` | As `/me/requested` |
| `GET /api/orders/admin/users/{userId}/delivered` | **ADMIN session only.** That user's deliveries, same rules as `/me/delivered` | As `/me/delivered` |
| `GET /api/orders/me/delivered` | Orders the caller runs as courier (F9.2). `status=past` (default): `COMPLETED`. `status=active`: `ACCEPTED`, `PICKED_UP` or `DELIVERED` while still assigned to the caller | As above |

An `OPEN` order whose deadline has passed is never offered, even before the
expiry job has expired it.

Query parameters (all optional; filters combine with AND, a blank value is ignored):

| Parameter | Applies to | Rule |
| --- | --- | --- |
| `minReward`, `maxReward` | pool | Positive whole credits, inclusive; `minReward` must not exceed `maxReward` (F4.2) |
| `pickupLocationId`, `dropoffLocationId` | pool | Supplier location UUID (F4.2) |
| `sort` | pool | `deadline` (nearest pickup deadline first, the default), `reward` (highest first, then nearest deadline) or `pickupLocationName` (A to Z ignoring case, orders without a stored name last, then nearest deadline). `id` breaks any remaining tie so paging is stable (F4.3) |
| `userId` | admin lists | User Service UUID of the person to look up; anything else is `INVALID_QUERY` |
| `status` | my lists | `active` or `past` (default), case-insensitive |
| `state` | my lists | One order state; must be one the chosen `status` list contains (e.g. `status=past&state=CANCELLED`) |
| `page` | all | Zero-based, default `0` |
| `size` | all | `1`–`50`, default `20` |

No matches returns `200` with an empty `items` list, which the client shows as
"no matches" (F4.5). Any invalid value returns `400` problem+json with
`code: INVALID_QUERY` and a `detail` naming the parameter.

**F4.4 (keep the courier's filters) is client-only:** the client remembers the last
filter/sort values and sends them again; the API is stateless.

## Order events (contract)

The cross-service wire format is the shared
[event communication blueprint](../docs/integration/event-communication-blueprint.md)
(version 1); this section summarises Order's part of it.

**Published to `order.events`** (key = order UUID), only for transitions that
change credits:

| Event | When | Credit effect |
| --- | --- | --- |
| `OrderSubmitted` | A valid order is stored as `PENDING_CREDIT` | Reserve the reward |
| `OrderCancelled` | The requester cancels (`compensationRequired` when it was `ACCEPTED`) | Release, or compensate the courier |
| `OrderExpired` | The deadline passes while `OPEN`, a reservation is confirmed too late, or a courier withdraws after the deadline | Release |
| `OrderCompleted` | The requester confirms receipt | Settle the full reward to the courier |
| `OrderRewardChangeRequested` | The requester edits an `OPEN` order's reward | Adjust the reservation to `newCreditReward` |

Each event uses the blueprint envelope (`eventVersion` 1, `producer`
`order-service`, `aggregateType` `Order`, UTC `occurredAt`, one `correlationId`
per order, `causationId` null, `actor` `{type: USER, userId, role}` or
`{type: SYSTEM}`). Its `data` carries a UUID `operationId`, generated once and
stored with the outbox row so retries never create a second operation. Other
transitions (opened, accepted, reopened, picked up, delivered, reservation
failed) change no credits and are only recorded in the order's history.

**Consumed from `credit.events`** (`CreditOutcomeHandler`): `CreditReserved`
opens the order, `CreditReservationRejected` ends it, `CreditAdjusted` applies
the pending reward and `CreditAdjustmentRejected` drops it (both only if the
order is still `OPEN` with that reward pending; otherwise the event is recorded as
`IGNORED`), and `CreditReleased`,
`CreditSettled` and `CourierCompensated` only set the order's `creditStatus`.
Each event is validated, deduplicated by `eventId` in the `processed_events`
inbox, and matched to the Order command it answers by `operationId`, all in one
transaction.

**Kafka transport.** An outbox relay sends pending `outbox_events` rows to
`order.events` every second, keyed by the order UUID and reusing each row's stored
`eventId` and payload; a row is marked `published_at` only after Kafka
acknowledges, and a failed send stays pending with `attempts` increased. Once an
order's event fails, that order's later events wait, so they are never published
out of order. A listener consumes `credit.events` as group `order-service` and
acknowledges a record only after `CreditOutcomeHandler` commits; transient
failures are retried three times with backoff, then the original record goes to
`credit.events.DLT` (contract violations go there without retries).

| Setting | Env var | Default |
| --- | --- | --- |
| Turn Kafka on/off | `ORDER_KAFKA_ENABLED` | `true` (`false` runs without a broker; events wait unpublished) |
| Bootstrap servers | `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092` (Compose sets `kafka:9092`) |
| Security protocol | `KAFKA_SECURITY_PROTOCOL` | `SASL_PLAINTEXT` |
| SASL mechanism | `KAFKA_SASL_MECHANISM` | `PLAIN` |
| Identity | `KAFKA_USERNAME` / `KAFKA_PASSWORD` | `order_service` / (none) |

Order does not create topics or ACLs; the shared `kafka-init` does
([`deploy/kafka/README.md`](../deploy/kafka/README.md)). The full round trip also
needs Credit Service to consume `order.events` and publish `credit.events`.

## Lifecycle

Every transition in the table is implemented: creation, Credit's reservation
outcome (`PENDING_CREDIT → OPEN / EXPIRED / RESERVATION_FAILED`, which the Kafka
consumer will call in a later iteration), requester cancellation, expiry,
acceptance, withdrawal, pickup, delivery and completion. Editing details and the
reward (through Credit) is implemented too. Events are stored in the outbox but
not yet published. The table
below is the approved target; [`DESIGN.md`](DESIGN.md) has the full transition
table with guards, error codes, events and the iteration plan.

**R** = the order's requester (session role `REQUESTER`), **C** = the assigned
courier (session role `COURIER`), **Sys** = the expiry scheduler or a Credit reply.

| Current | Next | Actor | Guard | Credit effect | Event |
| --- | --- | --- | --- | --- | --- |
| — | PENDING_CREDIT | R | Valid fields; deadline in the future | Reserve the reward | `OrderSubmitted` |
| PENDING_CREDIT | OPEN | Sys | `CreditReserved` before the deadline | — | (history only) |
| PENDING_CREDIT | EXPIRED | Sys | `CreditReserved` at or after the deadline | Release in full | `OrderExpired` |
| PENDING_CREDIT | RESERVATION_FAILED | Sys | `CreditReservationRejected`; `terminalReason` is `INSUFFICIENT_CREDITS`, `CREDIT_ACCOUNT_NOT_FOUND` or `CREDIT_RESERVATION_REJECTED` (other reason codes) | — | (history only) |
| OPEN | OPEN (edit) | R | No reward adjustment pending; `version` matches | Adjust if the reward changed; the new reward applies only after `CreditAdjusted` | `OrderRewardChangeRequested` if the reward changed |
| OPEN | CANCELLED | R | — | Release in full, no compensation | `OrderCancelled` |
| OPEN | EXPIRED | Sys | `now >= pickupDeadline` | Release in full | `OrderExpired` |
| OPEN | ACCEPTED | C (any user except R) | Before the deadline; no reward adjustment pending; first request wins | — | (history only) |
| ACCEPTED | OPEN | C | Withdraws before the deadline; courier cleared, back in the pool | — | (history only) |
| ACCEPTED | EXPIRED | C | Withdraws at or after the deadline; courier cleared | Release in full | `OrderExpired` |
| ACCEPTED | CANCELLED | R | Before pickup; courier cleared | Courier gets `ceil(reward × 20 / 100)`, the rest returns to R | `OrderCancelled` |
| ACCEPTED | PICKED_UP | C | Late pickup allowed | — | (history only) |
| PICKED_UP | DELIVERED | C | — | — | (history only) |
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

## Errand UI

A React frontend in `frontend/` is packaged inside the service, like the Credit dashboard. The
service serves it at `/errands` with assets under `/order-assets/**`; it reuses the shared-origin
login (`sessionStorage["foc.user-session"]`) and calls `/api/orders`. The "Request a hand" form also
reads active locations from Supplier's public `GET /api/suppliers` and the caller's balance from
Credit's `GET /api/credits/me`, both from the browser; Order Service itself never calls them. Design source and API
adaptations: [`frontend/docs/design-source.md`](frontend/docs/design-source.md).

```sh
cd frontend
npm ci
npm run dev          # http://localhost:5176; proxies /api/orders, /api/suppliers, /api/credits
npm run lint && npm run typecheck && npm test && npm run build
```

Through the shared gateway the UI is at <http://localhost:8088/errands> (routes `order-ui` and
`order-api`).

## Run with Docker Compose

Order Service and its private database (`order-db`, host port `127.0.0.1:5436`) are part of the
root `compose.yaml`. Put `ORDER_DB_NAME`, `ORDER_DB_USER` and `ORDER_DB_PASSWORD` in the root `.env`
(see `.env.example`); Compose also requires the shared User, Credit and Kafka variables. Then:

```sh
docker compose up -d --build
```

The service listens on `8082` and verifies tokens with User Service's JWKS inside the Compose
network. Its Kafka identity (`order_service`) is configured for the shared broker.

## Postman walkthrough

[`postman/Friend-on-Campus-Order-API.postman_collection.json`](postman/Friend-on-Campus-Order-API.postman_collection.json)
runs the errand lifecycle end to end through the gateway (`baseUrl`, default
`http://localhost:8088`), with real User, Supplier, Credit and Kafka:

| Folder | Shows |
| --- | --- |
| 0. Setup | Sign-in for requester, courier and admin (tokens are stored automatically), credit allocation, two Supplier locations |
| 1. Create, read and edit | `401`/`403`/`400` on create, `PENDING_CREDIT → OPEN` via Credit, raising the reward reserves only the difference, `409 VERSION_CONFLICT`, history |
| 2. Discover and accept | Pool with filters, own errands hidden, `403 SELF_ACCEPTANCE_FORBIDDEN`, wrong-role `403`, accept, the race loser's `409 ORDER_ALREADY_ACCEPTED`, courier's active list |
| 3. Deliver and complete | Wrong-role `403`s, `409 CANCELLATION_NOT_ALLOWED` after pickup, completion pays the courier the full reward, a repeated completion returns `200` with no second effect |
| 4. Cancel, compensate and withdraw | `403 NOT_ASSIGNED_COURIER`, withdrawal reopens, re-acceptance, `403 NOT_ORDER_REQUESTER`, cancelling an accepted errand pays the courier `ceil(20%)`, a repeated cancel is a no-op |
| 5. Admin views | An ADMIN session reads another user's requested/delivered errands; a requester session gets `403` |

Set `requesterEmail`/`requesterPassword`, `courierEmail`/`courierPassword` and
`adminEmail`/`adminPassword` first: three different active accounts, the requester with at least
7 available credits, the admin with the Admin role. Run the folders in order. Keep passwords and
tokens in a local Postman environment; never commit or export them in the collection.

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
