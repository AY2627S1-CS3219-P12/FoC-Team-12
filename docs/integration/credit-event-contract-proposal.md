# Credit event contract proposal

Status: **Proposed for team review - not yet an approved runtime contract**

This document gives the User, Order, Credit and broker owners one concrete contract to review for
the D3 registration-to-allocation and order-credit workflows. Do not wire production consumers or
producers until the affected owners approve the event names, payloads and recovery responsibilities.

## Owners and review checklist

| Owner | Responsibility before approval |
| --- | --- |
| Darryl - User Service | Confirm when `UserActivated` is emitted and that it is emitted only for an activated user UUID. |
| XueTing - Order Service | Confirm lifecycle event names, state/version semantics, compensation flag and Credit outcome handling. |
| Eldridge - Credit Service | Confirm ledger effects, operation identity, idempotency and emitted Credit outcomes. |
| Jun Hui - broker reliability/observability | Confirm topic names, partitioning, retry policy, dead-letter handling and monitoring. |

Record approval in the pull request. Any payload change after approval requires a new
`eventVersion`; do not silently reinterpret version 1.

## Delivery model

- Proposed technology: Kafka with **at-least-once** delivery.
- Proposed topics: `user.events`, `order.events` and `credit.events`. These match the current Order
  design; Jun Hui still needs to approve the broker names and policies.
- Message key: `aggregateId`. All events for one User or Order therefore use the same partition.
- Consumers must assume duplicate delivery. `eventId` is the durable idempotency key.
- A repeated `eventId` with identical content is ignored after successful processing.
- A repeated `eventId` with different envelope or payload content is a contract violation and must
  be rejected and alerted.
- Producers write an outbox row in the same database transaction as their business change.
  Publishers retry pending rows and mark them published only after broker acknowledgement.
- Consumers persist an inbox receipt before processing. The Credit ledger effect and the inbox
  `PROCESSED` state commit atomically. A failed receipt remains retryable.

## Common envelope

This follows the envelope already described by Order Service.

```json
{
  "eventId": "ea5f45d9-8911-40c4-b9c4-83f33b8492d8",
  "eventType": "OrderSubmitted",
  "eventVersion": 1,
  "aggregateType": "Order",
  "aggregateId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
  "aggregateVersion": 0,
  "occurredAt": "2026-10-15T14:00:00Z",
  "producer": "order-service",
  "correlationId": "14840a84-fcd4-47ed-97a4-d8693f28a935",
  "causationId": null,
  "actor": {
    "userId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
    "role": "REQUESTER"
  },
  "data": {}
}
```

Rules:

- `eventId`: new UUID for this fact; never reused for a different fact.
- `operationId`: required inside `data` for every credit-affecting Order event and copied into the
  corresponding Credit reply. It identifies the business operation independently of broker
  delivery, while `eventId` identifies one published event.
- `aggregateId`: User UUID for User events and Order UUID for Order/Credit order events.
- `aggregateVersion`: version after the producer's state change. Allocation may use User version 1
  if User Service has no persisted aggregate version; Darryl must confirm.
- `correlationId`: stable across the complete registration or order workflow.
- `causationId`: event that directly caused this event; null only for the initiating event.
- `actor`: authenticated initiator when applicable; system-triggered expiry may use
  `{ "type": "SYSTEM" }`.
- Timestamps are UTC ISO-8601 values.

## Proposed incoming events for Credit Service

| Event | Producer | Credit action | Proposed data |
| --- | --- | --- | --- |
| `UserActivated` | User | Allocate 10 credits once for the User UUID. | `userId`, `activatedAt` |
| `OrderSubmitted` | Order | Reserve `creditReward` from the requester. | `operationId`, `orderId`, `requesterId`, `creditReward` |
| `OrderRewardChangeRequested` | Order | Adjust an active reservation to `newCreditReward`. | `operationId`, `orderId`, `newCreditReward` |
| `OrderCompleted` | Order | Transfer the full reservation to the courier. | `operationId`, `orderId`, `courierId`, `completedAt` |
| `OrderCancelled` | Order | Release the reservation, or compensate the courier and release the remainder. | `operationId`, `orderId`, `courierId`, `compensationRequired`, `reason`, `cancelledAt` |
| `OrderExpired` | Order | Release the full reservation. | `operationId`, `orderId`, `reason`, `expiredAt` |

`OrderCancelled.courierId` is required when `compensationRequired` is true and must otherwise be
null. Order Service owns the lifecycle decision; Credit Service must not infer whether compensation
is due.

### Example: `OrderSubmitted`

```json
{
  "eventId": "ea5f45d9-8911-40c4-b9c4-83f33b8492d8",
  "eventType": "OrderSubmitted",
  "eventVersion": 1,
  "aggregateType": "Order",
  "aggregateId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
  "aggregateVersion": 0,
  "occurredAt": "2026-10-15T14:00:00Z",
  "producer": "order-service",
  "correlationId": "14840a84-fcd4-47ed-97a4-d8693f28a935",
  "causationId": null,
  "actor": {
    "userId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
    "role": "REQUESTER"
  },
  "data": {
    "operationId": "c18cc1ac-690c-5f58-8a1f-21d8f5981ab4",
    "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
    "requesterId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
    "creditReward": 3
  }
}
```

## Proposed outgoing Credit events

| Event | Consumer | Meaning / proposed data |
| --- | --- | --- |
| `CreditAccountAllocated` | User/observability | `userId`, `allocatedAmount`, `availableBalance`; allocation is complete or was already complete. |
| `CreditReserved` | Order | `operationId`, `orderId`, `reservationId`, `amount`, requester balances; Order may move `PENDING_CREDIT` to `OPEN`. |
| `CreditReservationRejected` | Order | `operationId`, `orderId`, `reasonCode`; Order may move to `RESERVATION_FAILED`. Do not include private exception text. |
| `CreditAdjusted` | Order | `operationId`, `orderId`, `reservationId`, `amount`, requester balances. |
| `CreditAdjustmentRejected` | Order | `operationId`, `orderId`, `reasonCode`; the previous reservation remains unchanged. |
| `CreditReleased` | Order | `operationId`, `orderId`, `releasedAmount`, requester balances. |
| `CreditSettled` | Order | `operationId`, `orderId`, `requesterId`, `courierId`, `transferredAmount`, both resulting balances. |
| `CourierCompensated` | Order | `operationId`, `orderId`, `requesterId`, `courierId`, `transferredAmount`, `releasedAmount`, resulting balances. |

Each outgoing event uses a fresh `eventId`, copies the triggering event's `operationId` and
`correlationId`, and sets `causationId` to the incoming `eventId`. Approved Credit handlers must use
the incoming `operationId` as the durable domain operation identity, while the inbox uses `eventId`
to suppress redelivery of the same broker event.

### Operation ID decision still required

Credit currently stores operation IDs as UUIDs. Order's current design describes the conceptual
identity as `{orderId}:{action}:{orderVersion}`. Before handlers are wired, XueTing and Eldridge must
agree that Order sends a UUID-form `operationId` (for example, a deterministic UUID derived from
that tuple), or jointly approve a schema migration to store textual operation IDs. Do not implement
an implicit conversion independently in either service.

## Ordering decision to approve

Order events must be keyed by Order UUID. Kafka partition order should preserve their sequence, but
consumers must still compare `aggregateVersion` because replay, retry and recovery can expose stale
messages. Proposed behavior:

1. Same event ID and content: return the previously recorded outcome.
2. Lower aggregate version than the last processed version: ignore as stale and log it.
3. Next expected aggregate version: process normally.
4. Version gap: leave the event retryable, alert, and reconcile with Order Service rather than
   guessing the missing state.

The current Credit inbox implements rules 1 and conflicting-replay detection. Aggregate-version
gap tracking is a follow-up after XueTing confirms the Order version contract.

## Failure and reconciliation responsibilities

| Failure | Owner | Recovery |
| --- | --- | --- |
| Producer commits but broker publish fails | Producing service | Pending outbox row is retried until acknowledged. |
| Credit receives the same message repeatedly | Credit | Inbox/event ID suppresses repeated ledger effects. |
| Credit processing fails temporarily | Credit + Jun Hui | Receipt is marked `FAILED`; broker retry invokes it again. Alert after the agreed attempt threshold. |
| Credit reserves but Order has not observed `CreditReserved` | Credit publisher + Order consumer | Retry the pending Credit outbox event; Order consumes idempotently. |
| Order is completed while Credit is unavailable | Order producer + Credit consumer | Order outbox retains the event; Credit processes it when available. |
| Retry limit is exceeded | Jun Hui + owning consumer | Move to a dead-letter topic, alert with event/correlation IDs, then replay after correction. |

Reconciliation must report counts and oldest age for Credit inbox rows in `RECEIVED`/`FAILED` and
outbox rows without `publishedAt`. Logs must include `eventId`, `eventType`, `producer`,
`correlationId` and outcome, but never credentials or full personal-data payloads.

## Security boundary

- Student JWTs authorize only user-facing Credit queries and self-activation during the temporary
  pre-Kafka phase.
- Internal ledger mutations must come from approved broker identities or a separately approved
  service-to-service credential. Do not expose reserve/transfer/release as user-callable endpoints.
- Credit trusts User UUIDs and Order lifecycle facts only from their owning services.

## Implementation handoff

After approval:

1. Darryl adds a User outbox and emits `UserActivated` after activation commits.
2. XueTing adds the Order outbox, emits lifecycle events and consumes Credit outcomes idempotently.
3. Eldridge maps approved events to the existing Credit allocation/reservation/settlement services
   and writes Credit outcomes to the outbox in the same transaction.
4. Jun Hui supplies Kafka topics, ACLs, retry/dead-letter policy, dashboards and alerts.
5. The team demonstrates delayed publishing, duplicate delivery, insufficient credits, completion,
   cancellation/expiry and recovery after one service is temporarily unavailable.
