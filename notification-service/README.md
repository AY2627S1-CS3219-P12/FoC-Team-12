# Notification Service blueprint

Shared proposed wire shapes and fixtures: [contract package](../docs/contracts/README.md).

The latest Kubernetes default-deny policies do not yet allow Notification traffic. Its deployment
iteration must add reviewed Gateway ingress and DB/User-JWKS/Kafka egress plus matching destination
ingress and broker ACLs; see the contract package's deployment matrix.

Owner: **XueTing**. Status: planned N2H; documentation only, no application scaffold or runnable
commands yet. Source: D3 presentation slides 2-5, D1 N2H3. Proposed API/configuration details below
require owner review before implementation; they do not represent deployed contracts.

## Purpose and boundary

Provide private, durable in-app notifications about successful Order/Credit outcomes. Consume
events, store one intended notification per recipient/business outcome, and serve that user's
history. Do not change orders, calculate credits, send verification emails, store chats or inspect
other databases. No email/push/SMS delivery, Admin-case notifications or translation in this scope.

Browser -> Gateway -> Notification HTTP API. Order/Credit -> Kafka -> Notification private
PostgreSQL database. A notification confirms a committed source fact, not an attempted action.
It must not imply that credits were released before Credit confirms its operation.

## Event integration

Read the [core event blueprint](../docs/integration/event-communication-blueprint.md) and
[Chat/Order lifecycle proposal](../docs/integration/chat-admin-contract.md#event-coverage-and-persistence).
Use `notification-service` as independent consumer group on `credit.events` and proposed
`order.lifecycle.events`. Never share Order/Credit/Chat groups. Core `order.events` alone does not
include acceptance/pickup/delivery. Current OrderEventRecorder publishes only the five core
credit-driving events; add full lifecycle production as an Order-owned iteration before claiming
notification integration is complete. Do not invent events by polling Order's DB.

The Order-owned lifecycle schema must be agreed once for both Chat and Notifications. Its
proposed `OrderTransitioned` envelope carries stable eventId/orderId, sourceSequence, requesterId,
previousCourierId/courierId, fromState/toState, occurredAt and snapshot; preserve recipient IDs
when cancellation/withdrawal clears the live assignment. Reuse the same versioned schema and
fixtures for both consumers; do not independently rename fields.

| Notification type | Source/condition | Recipient | Message intent |
| --- | --- | --- | --- |
| ORDER_OPENED | OrderTransitioned PENDING_CREDIT -> OPEN | Requester | Errand is live |
| ORDER_RESERVATION_FAILED | OrderTransitioned -> RESERVATION_FAILED | Requester | Creation failed; show safe approved reason |
| ORDER_ACCEPTED | OrderTransitioned OPEN -> ACCEPTED | Requester | Courier accepted |
| ORDER_COURIER_WITHDREW | OrderTransitioned ACCEPTED -> OPEN | Requester | Courier withdrew; errand returned to pool |
| ORDER_EXPIRED | OrderTransitioned -> EXPIRED | Requester | Errand expired; credit release may still be pending |
| ORDER_CANCELLED | OrderTransitioned ACCEPTED -> CANCELLED | Previous assigned courier | Requester cancelled |
| ORDER_PICKED_UP | OrderTransitioned -> PICKED_UP | Requester | Item picked up |
| ORDER_DELIVERED | OrderTransitioned -> DELIVERED | Requester | Delivered; confirm receipt |
| ORDER_COMPLETED | OrderTransitioned -> COMPLETED | Courier | Requester confirmed receipt |
| CREDITS_WELCOME | CreditAccountAllocated | userId | Initial credits allocated |
| CREDITS_RECEIVED | CreditSettled | courierId | Settlement credits received |
| CREDITS_COMPENSATED | CourierCompensated | courierId | Cancellation compensation received |

Do not generate CREDITS_RECEIVED/COMPENSATED from Order state alone. Credit ledger amounts and
safe rejection codes come from Credit; Order reason details must be explicitly added to its
agreed snapshot if absent. Ignore valid source events outside this table. Unsupported schema or
missing required recipients is a recoverable contract failure, not a notification to an arbitrary
user. OPEN cancellation does not notify a nonexistent courier. Additional rows require approval.

## Persistence and delivery guarantees

Suggested tables: notification_inbox (eventId, canonical content hash, source/type, outcome),
notifications (id, recipientUserId, type, orderId nullable, sourceEventId, businessKey, safe
message parameters, occurredAt, createdAt, readAt nullable). Unique inbox eventId and notification
businessKey enforce idempotency. Business key: recipient/type/source-operationId for Credit;
recipient/type/orderId/sourceSequence for Order (two genuine reopen/accept cycles are distinct).
Use opaque UUID notification IDs and actor identity only from verified JWT sub.

Validate event envelope/topic/producer/version first. Matching eventId/content is duplicate;
changed content is a conflict. Commit inbox and notifications atomically before Kafka ack.
Retain past delayed facts rather than discard them on a generic 'older version' check. Sort by
occurredAt then notificationId for stable presentation. Do not treat gaps as permission to guess
transitions. Crash-after-commit or source replay creates no second logical notification.

Transient failures use bounded broker retries/DLT under the existing deployed policy. Jun Hui
owns ACL/DLT provisioning; XueTing owns consumer/inbox and mapping. Poison records retain original
IDs, key and failure metadata for restricted replay. A valid unhandled fact may be acknowledged
as ignored; invalid event types/versions must not silently disappear.

Retention: support stored retrieval; no automatic deletion until the team approves a retention
period and unread-record policy. Inbox deduplication metadata must survive any later notification
cleanup for the supported replay horizon. Pagination does not imply a 100-record storage cap.

## Proposed public API and UI

| Method/path | Behaviour |
| --- | --- |
| GET /api/notifications/me?page=0&size=20 | Own notifications, newest first; content/page/size/totalElements/totalPages |
| PATCH /api/notifications/me/{id}/read | Idempotently set own readAt (proposed convenience feature) |

List entry: id, type, orderId nullable, message, occurredAt, readAt nullable. Size 1-100; reject
invalid pagination with 400. No recipientId override or admin-all-users endpoint. Authenticate
User RS256 JWT against published JWKS, issuer/audience/expiry/sub; accept valid current session
roles under the shared User contract. 401 invalid identity; 404 for another user's/missing record;
Problem Details for errors. Never send full incoming event payloads or another user's data.

Notification UI lives in the Notification-owned area and uses same-origin gateway APIs. List
loading/empty/error/expired-session states and links to authorized errand pages. Proposed UI path
`/notifications`; optional badge/read controls require explicit scope approval in feature analysis.
Polling is sufficient initially; WebSocket delivery is not required by the D3 notification plan.
No browser code or untrusted notification link grants access to an order.

## NFRs and acceptance

D3 NF1: at least 99% valid retrieval success over a 30-minute normal-load run; separately classify
unrelated auth/gateway/dependency failures and retain observable outcomes. D3 NF2: for a user with
up to 100 stored notifications, P95 retrieval <=2 seconds, measured request receipt to returned
data, not event-processing time. Agree/record normal-load concurrency and hardware before testing;
these slides do not specify them. Do not invent a 2,000-user commitment.

Automated: mapping table fixtures, unrelated-recipient denial, each supported source condition,
source replay/new ID same operation, repeated acceptance cycles, out-of-order delivery, concurrent
consumption, DB restart, invalid schema -> DLT, safe reason rendering and no credentials in logs.
Manual real-broker: create/accept/withdraw/pickup/deliver/complete, rejected reservation, expiry,
cancellation compensation, independent two-user notification histories, consumer outage/replay.

## Iteration and handoff

1. `$foc-iterate-feature notification-service-contract: Finalize lifecycle/credit fixtures and recipient mapping with producer owners.`
2. `$foc-iterate-feature notification-service-foundation: Scaffold the private database, backend and authenticated history UI shell.`
3. `$foc-iterate-feature notification-service-consumer: Persist retry-safe notifications from the agreed event mappings.`
4. `$foc-iterate-feature notification-service-history: Expose private paginated history and update the live GUI.`
5. `$foc-iterate-feature notification-service-recovery: Verify real-broker recovery, retention policy and D3 retrieval NFRs.`

No scaffold means no valid build/test command yet. Add Maven verify and frontend lint/typecheck/
test/build jobs when those implementations exist. Jun Hui/nominated editor handles routes, broker
credentials and Compose/CI wiring with affected reviews and compose_env_check. XueTing implements
Order lifecycle producer coverage in Order; Eldridge approves Credit payloads; no financial changes
belong here. Existing Admin case notifications remain deferred.
