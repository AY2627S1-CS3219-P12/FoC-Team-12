# Shared event communication blueprint

Version: **1**
Applies to: **User, Order, Credit and Kafka infrastructure**

This is the implementation contract for D3 event communication. If a service-specific design uses
different topic names, event names or payload fields, this blueprint takes precedence for the
cross-service wire format. Do not reinterpret a version-1 event in place: make a documented
`eventVersion` change when the schema or meaning changes.

## End-to-end flows

```text
User activation
User Service -> user.events -> Credit Service -> credit.events
   UserActivated                 allocate 10          CreditAccountAllocated

Order lifecycle
Order Service -> order.events -> Credit Service -> credit.events -> Order Service
   OrderSubmitted                reserve credits       CreditReserved / CreditReservationRejected
   OrderRewardChangeRequested    adjust reservation    CreditAdjusted / CreditAdjustmentRejected
   OrderCancelled                release/compensate     CreditReleased / CourierCompensated
   OrderExpired                  release               CreditReleased
   OrderCompleted                settle                CreditSettled
```

Services never read or write another service's database. User and Order publish facts through
Kafka; Credit owns all balance, reservation and ledger changes; Order consumes Credit outcomes to
update its own workflow state.

## Kafka configuration

| Topic | Key | Producer | Consumers |
| --- | --- | --- | --- |
| `user.events` | User UUID | User Service | Credit Service |
| `order.events` | Order UUID | Order Service | Credit Service |
| `credit.events` | User UUID for allocation; Order UUID for order outcomes | Credit Service | Order Service and observability |
| `<source-topic>.DLT` | Original key | Retry recoverer | Operations/observability |

- Use three partitions for each normal topic and one partition for each DLT in the local D3 setup.
- Producer settings: `acks=all` and idempotent production enabled.
- Consumer groups: `credit-service` for Credit consumers and `order-service` for Order consumers.
- Delivery is **at least once**. Every consumer must be idempotent.
- A consumer acknowledges a record only after its database transaction commits.
- Retry a transient failure three times with backoff, then publish the original record to the
  source topic's `.DLT` while retaining the original key and event metadata.

## Required envelope

Every event is UTF-8 JSON with these fields:

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
    "type": "USER",
    "userId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
    "role": "REQUESTER"
  },
  "data": {}
}
```

| Field | Required rule |
| --- | --- |
| `eventId` | UUID generated once for this published fact. Kafka retries reuse the same value. |
| `eventType` | Exact case-sensitive name from this blueprint. |
| `eventVersion` | Integer `1` for the schemas below. |
| `aggregateType` | `User` or `Order`. |
| `aggregateId` | Same UUID used as the Kafka record key. |
| `aggregateVersion` | Entity version after the producing state change. `UserActivated` uses `1`; a newly inserted Order may use `0`. |
| `occurredAt` | UTC ISO-8601 timestamp. |
| `producer` | `user-service`, `order-service` or `credit-service`. |
| `correlationId` | UUID retained across one complete activation/order workflow. The initiating event creates it. |
| `causationId` | Direct triggering event's `eventId`; null only for the initiating event. |
| `actor` | User actor as shown above, or `{ "type": "SYSTEM" }` for schedulers/system processing. |
| `data` | Event-specific object defined below. Unknown fields may be ignored; required fields may not. |

## Identity and replay rules

- `eventId` identifies a broker event and is the Credit/Order inbox primary key.
- `operationId` is a UUID inside `data` that identifies one credit-changing business operation.
- User or Order generates `operationId` once when its state change and outbox row commit. It stores
  that UUID in the outbox payload and never creates a replacement UUID for a retry.
- Credit copies the incoming `operationId` into its outcome event and uses it as the durable
  `credit_operations.id` value.
- Credit outcomes use a fresh `eventId`, the same `correlationId`, and the incoming `eventId` as
  `causationId`.
- A Credit outcome for an Order copies the triggering Order event's `aggregateVersion`; Credit does
  not create a new Order version. Order correlates that outcome using `operationId`.
- Same `eventId` and same content: return/retain the recorded result without applying the effect
  again.
- Same `eventId` with different envelope or payload content: reject as `EVENT_ID_CONFLICT`, do not
  change balances, and alert using the event and correlation IDs.
- Same `operationId` with a different requested business operation: reject as
  `OPERATION_ID_CONFLICT` and do not change balances.

## User-to-Credit event

### `UserActivated` -> `user.events`

Emit only after the User account has successfully changed to `ACTIVE`. Store the activation and
outbox row in one transaction.

```json
{
  "operationId": "573a3b84-2c96-4da0-940d-08a43420f0db",
  "userId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
  "activatedAt": "2026-10-15T13:55:00Z"
}
```

Envelope rules: `aggregateType=User`, `aggregateId=userId`, `aggregateVersion=1`,
`producer=user-service`. Credit allocates exactly 10 credits at most once for the User UUID and
emits `CreditAccountAllocated`.

## Order-to-Credit events

All use `aggregateType=Order`, `aggregateId=orderId`, `producer=order-service`, and the Order UUID
as the Kafka key.

| Event | Required `data` | Credit effect |
| --- | --- | --- |
| `OrderSubmitted` | `operationId`, `orderId`, `requesterId`, `creditReward` | Reserve the positive whole-credit reward. |
| `OrderRewardChangeRequested` | `operationId`, `orderId`, `newCreditReward` | Increase or decrease the active reservation to the new positive amount. |
| `OrderCompleted` | `operationId`, `orderId`, `courierId`, `completedAt` | Transfer the full reservation to the courier. |
| `OrderCancelled` | `operationId`, `orderId`, `courierId`, `compensationRequired`, `reason`, `cancelledAt` | Release all credits, or compensate the courier and release the remainder. |
| `OrderExpired` | `operationId`, `orderId`, `reason`, `expiredAt` | Release the full reservation. |

Additional rules:

- `creditReward` and `newCreditReward` are positive JSON integers.
- `OrderCancelled.courierId` is required when `compensationRequired=true`; otherwise it is null.
- Order decides whether compensation is required. Credit must not infer Order lifecycle state.
- Compensation transfers `ceil(reservedAmount * 20 / 100)` to the courier and releases the rest
  to the requester.
- Order retains its current reward while an adjustment is pending and applies the new reward only
  after `CreditAdjusted`.

Example `OrderSubmitted.data`:

```json
{
  "operationId": "c18cc1ac-690c-4f58-8a1f-21d8f5981ab4",
  "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
  "requesterId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
  "creditReward": 3
}
```

## Credit outcome events

All are published to `credit.events` by `credit-service`. Every outcome includes the incoming
`operationId` and uses the same aggregate/key as the incoming workflow.

| Event | Required `data` | Order behavior |
| --- | --- | --- |
| `CreditAccountAllocated` | `operationId`, `userId`, `allocatedAmount`, `availableBalance` | No Order action; observable activation outcome. |
| `CreditReserved` | `operationId`, `orderId`, `reservationId`, `amount`, `availableBalance`, `reservedBalance` | `PENDING_CREDIT -> OPEN`; store `reservationId`. |
| `CreditReservationRejected` | `operationId`, `orderId`, `reasonCode` | `PENDING_CREDIT -> RESERVATION_FAILED`. |
| `CreditAdjusted` | `operationId`, `orderId`, `reservationId`, `amount`, `availableBalance`, `reservedBalance` | Apply pending reward and clear the pending flag. |
| `CreditAdjustmentRejected` | `operationId`, `orderId`, `reasonCode` | Keep the previous reward and clear the pending flag. |
| `CreditReleased` | `operationId`, `orderId`, `releasedAmount`, `availableBalance`, `reservedBalance` | Set Order credit status to `RELEASED`; do not change Order lifecycle state. |
| `CreditSettled` | `operationId`, `orderId`, `requesterId`, `courierId`, `transferredAmount`, `requesterAvailableBalance`, `courierAvailableBalance` | Set Order credit status to `SETTLED`; do not change Order lifecycle state. |
| `CourierCompensated` | `operationId`, `orderId`, `requesterId`, `courierId`, `transferredAmount`, `releasedAmount`, `requesterAvailableBalance`, `courierAvailableBalance` | Set Order credit status to `COMPENSATED`; do not change Order lifecycle state. |

Allowed rejection `reasonCode` values:

- `INSUFFICIENT_CREDITS`
- `CREDIT_ACCOUNT_NOT_FOUND`
- `RESERVATION_NOT_FOUND`
- `INVALID_RESERVATION_STATE`
- `REQUEST_CONFLICT`

Do not put stack traces, exception messages, credentials or personal data in outcome payloads.

## Transaction and recovery rules

### Every producer

1. Apply its domain change and insert the complete outbox event in the same database transaction.
2. Publish pending outbox rows using their stored `eventId`, payload and Kafka key.
3. Set `publishedAt` only after Kafka acknowledges the send.
4. Leave a failed row pending, increment its attempt count and retry it.

### Every consumer

1. Validate the envelope, version, producer, aggregate and required payload fields.
2. Insert/lock the inbox receipt using `eventId`.
3. Check `operationId` before applying any credit-changing effect.
4. Apply the domain effect, write any ledger/history rows, insert the outcome outbox event and mark
   the inbox row processed in one transaction.
5. Acknowledge Kafka only after that transaction commits.

### Ordering

- Partition by `aggregateId`, which preserves ordering for one User/Order.
- Credit tracks the latest processed version for incoming Order lifecycle events. A lower version is
  stale; the next expected version is processed normally.
- A different incoming Order event with the same version is a contract violation because one Order
  version may produce only one credit-changing command.
- Order does not reject a Credit outcome merely because it carries the same aggregate version as
  the triggering command. It matches the pending command by `operationId` and deduplicates by
  `eventId`.
- A version gap must not be guessed. Keep the event recoverable, alert using
  `eventId`/`correlationId`, and reconcile from the producing service.

### Observability

Logs and metrics include `eventId`, `eventType`, `operationId`, `producer`, `correlationId`, attempt
count and outcome. Monitor the count and oldest age of pending outbox rows, failed/received inbox
rows and DLT records. Never log JWTs, credentials or complete personal-data payloads.

## Implementation responsibilities

### User Service — Darryl

- Add a transactional outbox.
- Emit `UserActivated` once when verification changes a User to `ACTIVE`.
- Generate and persist the activation `operationId`, `eventId` and `correlationId`.
- Publish to `user.events` keyed by User UUID and retry pending outbox rows.

### Order Service — XueTing

- Add/use a transactional outbox for the five Order events defined above.
- Generate one UUID `operationId` per credit-changing transition and retain it in the outbox.
- Publish to `order.events` keyed by Order UUID.
- Consume `credit.events` with an inbox and apply only the Order behaviors in the outcome table.
- Do not call Credit synchronously and do not calculate balances or compensation amounts.

### Credit Service — Eldridge

- Consume `user.events` and `order.events` with the durable Credit inbox.
- Map `operationId` to the existing allocation, reservation, adjustment, release, settlement and
  compensation services.
- Commit ledger effects, inbox completion and the matching Credit outcome outbox row atomically.
- Publish outcomes to `credit.events`; never expose internal mutation endpoints to student JWTs.

### Kafka/reliability — Jun Hui

- Provide the three topics and their DLTs, partition counts and service access controls.
- Configure idempotent producers, consumer groups, retry/backoff and DLT recovery.
- Provide dashboards/alerts for consumer lag, pending/failed rows, retries and DLT records.
- Keep Kafka/Compose/environment changes in shared infrastructure configuration.

## Required integration demonstration

The team demonstrates all of the following through the real broker:

1. Activated User receives 10 credits exactly once.
2. Order submission reserves credits and opens only after `CreditReserved`.
3. Insufficient credits produces `CreditReservationRejected` without changing balances.
4. Reward increase/decrease adjusts only the difference.
5. Completion transfers the full reservation.
6. Cancellation/expiry releases credits; accepted-order cancellation compensates exactly 20%
   rounded up.
7. Duplicate delivery does not repeat a ledger effect.
8. Broker/service downtime leaves an outbox row pending and recovers after restart.
9. A poison event is retried and then appears in the correct DLT with traceable IDs.
