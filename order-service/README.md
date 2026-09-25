# Order Service

Owned by XueTing. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities.

Spring Boot service (Java 17) that owns the order aggregate, its lifecycle, and
the order database. Runs on port `8082`.

## Create order

`POST /api/orders`

- **Header:** `X-User-Id` — requester's user UUID. Auth-based identity replaces
  this header later; supplier mutations use the same temporary pattern.
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
  violations are collected under an `errors` map; a missing/malformed
  `X-User-Id` returns a problem without the `errors` map.

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

## Build and test

```bash
./mvnw test          # unit + web-slice validation tests (no database required)
./mvnw verify        # full build
```

Running the service needs a PostgreSQL database (`DB_HOST`/`DB_PORT`/`DB_NAME`/
`DB_USER`/`DB_PASSWORD`) and Compose wiring, which are shared root files added in
a follow-up.
