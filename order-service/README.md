# Order Service

Owned by XueTing. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities. The D3 roadmap is
[`IMPLEMENTATION_CHECKLIST.md`](IMPLEMENTATION_CHECKLIST.md).

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

Location **name snapshots** are not sent on create. Orders carry only location
IDs; the Supplier-owned names arrive asynchronously via an event and populate
the (nullable) snapshot columns — hence the one divergence from the reference
DDL, where those two columns are `NOT NULL`.

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
iteration persists to `PENDING_CREDIT` only.

## Lifecycle

| Current | Next | Actor/condition |
| --- | --- | --- |
| OPEN | ACCEPTED | Eligible courier, not the requester |
| OPEN | CANCELLED | Requester |
| OPEN | EXPIRED | Pickup deadline passed |
| ACCEPTED | OPEN | Assigned courier withdraws before deadline |
| ACCEPTED | EXPIRED | Assigned courier withdraws after deadline |
| ACCEPTED | CANCELLED | Requester before pickup; compensate courier through Credit |
| ACCEPTED | PICKED_UP | Assigned courier |
| PICKED_UP | DELIVERED | Assigned courier |
| DELIVERED | COMPLETED | Requester confirms receipt |

COMPLETED, CANCELLED and EXPIRED are terminal. Cancellation is forbidden after pickup.
The approved backlog governs unresolved boundary cases such as the exact deadline instant.

## Build and test

```bash
./mvnw test          # unit + web-slice validation tests (no database required)
./mvnw verify        # full build
```

Running the service needs a PostgreSQL database (`DB_HOST`/`DB_PORT`/`DB_NAME`/
`DB_USER`/`DB_PASSWORD`) and Compose wiring, which are shared root files added in
a follow-up.
