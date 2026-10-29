# N2H integration schemas - review draft v0.1.0

Create these before parallel integration work. They freeze proposed names/shapes for review;
they are not evidence that an API exists or that each producer owner has approved it. Darryl is
the document editor; Eldridge reviews Chat/Credit, XueTing Order/Notification, Jun Hui transport.
Approved scope: [Admin](../integration/admin-service-spec.md),
[Chat](../../chat-service/README.md), [Notification](../../notification-service/README.md).

| File | Purpose |
| --- | --- |
| n2h.openapi.json | OpenAPI 3.1 for new Admin, Chat, Notification and internal producer evidence/auth APIs |
| n2h-events.schema.json | JSON Schema 2020-12 for new lifecycle/Admin messages, with x-topic per variant |
| chat-websocket.schema.json | Proposed browser/server Chat JSON frames |
| events.examples.json | One valid example per new Kafka type, including topic and record key |
| http.examples.json | Request and success-response shape examples per HTTP operation |
| websocket.examples.json | Valid examples for each proposed browser/server WebSocket frame |

Use the core event blueprint for existing UserActivated/Order credit commands/Credit outcomes.
These files do not redefine them or change deployed core consumers. Public/service/actor security
requirements are explicit in OpenAPI. Multiple schemes in one security object mean ALL required,
not alternatives. Internal APIs must not be exposed as public gateway routes.

Draft details here take precedence over earlier informal signature examples for wire shapes only.
Changed meanings after owner review require a versioned contract/fixtures update agreed with
consumers. Consumers may accept unknown optional fields for forward compatibility, but must
validate all required fields and supported versions. Strict object schemas validate producer
fixtures; a new required field is not a backward-compatible change.

## Semantics schema validation cannot prove

- UUID relationships: actor.userId=requestedBy, command/outcome aggregateId=targetUserId=Kafka key;
  Order aggregateId=data.orderId; AdminCase aggregateId=data.caseId. Source/producer/type/topic
  must match. Owner outcomes retain operation/case/order/target/actor, not a new request identity.
- An event ID is distinct from an operation ID. Durable idempotency compares canonical semantic
  request hash, not bytes/JSON property ordering. Transport redelivery preserves eventId; controlled
  operation reconciliation may use a new eventId with original operation and semantic input.
- OrderTransitioned covers details-only edits too (same from/to state); snapshot.status equals
  toState. previousCourierId preserves the prior assignee when the current one is cleared.
  SourceSequence starts at 1 and is contiguous per source/stream/aggregate, not entity version.
- Chat COMPLETE requires producer checkpoint confirmation and no blocking gaps; it never means
  globally current forever. A known unavailable source yields UNKNOWN/INCOMPLETE, not empty proof.
  Exports pin snapshotId across pages. Existing pre-stream history uses stable baseline record IDs;
  do not fabricate a Kafka event that would replay a financial effect.
- All response schemas are successful DATA shapes, not a permission model. Resource authorization,
  case assignment/state and account state remain backend checks on every relevant operation.
- Message must contain text or one validated READY attachment, never both in this draft. Uploaded
  byte signature/size must match declared format. No arbitrary object keys or URLs in message body.
- A schema-valid action/outcome can still be a business rejection. Insufficient credits never
  alter reserved funds. No-op ban must have previousStatus=BANNED. Successful correction is APPLIED,
  never NO_CHANGE. Final result cannot be reversed by an older event.
- Export EvidenceRecord.sourceSequence is a projection/export sequence; existing core Credit
  events without it receive a stable Credit-owned evidence sequence in history export. This is
  not a silent modification to existing Kafka payloads; coverage compares owner export checkpoints.

## Latest-repository deployment handoff

Reviewed against `d09bb9a` (29 October 2026 checkout). The current role enum is REQUESTER/COURIER/
ADMIN, Order publishes five core credit-driving events only, and its local history records the
full action enum. New OrderTransitioned.action matches OrderAction exactly (including PICK_UP,
FAIL_RESERVATION and reward-change actions). Existing order.events remains untouched.

The repository now enforces default-deny ingress AND egress in
[Kubernetes network policies](../../deploy/k8s/network/README.md). New N2H traffic is NOT permitted
by those policies yet. A nominated shared editor must implement and test both sides of these
connections before deployment; do not weaken default-deny or route internal APIs publicly:

| Caller | Destination | Purpose |
| --- | --- | --- |
| Gateway | Admin, Chat, Notification | Public REST/UI; verify Chat WebSocket upgrade support |
| Each new service | Its own DB | Private persistence only |
| Admin | Chat; User | Evidence/conversations; JWKS/current admin eligibility |
| Chat | Admin; User; Order; Credit | Case access; JWT/admin eligibility; evidence/checkpoints |
| Chat | Redis; approved AWS HTTPS destinations | Translation cache/fan-out; S3/Translate |
| Notification | User | JWT public-key discovery |
| Admin, Chat, Notification | Kafka | Commands/events using separate principals/ACLs |

DNS is already a namespace exception. Pin chosen ports, labels, addresses, keys and images in
one reviewed deployment change; local HTTP does not satisfy production TLS. Existing policies
admit only named core clients to Kafka/User, and core backends admit only Gateway ingress, so
adding a Service alone is insufficient. Update network-policy positive/negative probes, Compose,
env examples, Kafka smoke environment, CI checks and gateway routes in the deployment iteration.

Producer history currently lacks full historical detail snapshots. Backfill must expose missing
legacy evidence instead of inventing it. Nullable location names preserve older orders, but missing
historical details/participants keep coverage incomplete; do not label current fields as old snapshots.

CREDIT evidence contains per-account ledgerEntries with available/reserved deltas and balances.
Preserve both sides of settlement/compensation. Rejection/no-op has empty ledgerEntries; rejection
has reasonCode. Export only relevant participants. Fixtures are isolated shape examples, not a
sequential demo: success/rejection examples may be alternatives of one operation. Owners supply
paired scenario fixtures before adapter release.

## WebSocket lifecycle

Proposed POST /api/chat/ws-tickets uses authenticated User JWT and conversationId. Ticket is opaque,
single-use, expires within 30 seconds and binds actor/conversation/original JWT expiry. Connect to
/ws/chat, send AUTHENTICATE as first frame within 5 seconds; never put token/ticket in URL.
Server returns AUTHENTICATED. SUBSCRIBE can only name the ticket-bound conversation. Permissions
are rechecked; close/reject on expired/revoked access. REST owns message writes; WebSocket frames
only notify committed data. Reconnect fetches authoritative REST history by sequence; duplicate
delivery is allowed and deduplicated by message ID. Translation notifications follow same access.
These limits are engineering defaults proposed for owner review, not added course requirements.

## Remaining product gate

Historical/replacement-courier access to ordinary chat history needs team approval. Wire schemas
do not authorize the proposed assignment-epoch visibility rule. Hold that feature boundary;
do not block unrelated foundations. Optional notification read marking and image/text limits
also remain proposed features/defaults. Owner review precedes consumers relying on them.

## Verification and implementation order

Regenerate: `python docs/contracts/build_contracts.py` (standard library only).
Validate: `python -m pip install -r docs/contracts/requirements-validation.txt` in a local environment, then run
`python docs/contracts/validate_contracts.py`. Generated JSON is checked in with its generator;
do not hand-edit it. CI integration is a separate shared change, not automatically enabled here.

Validation includes OpenAPI structure, local reference resolution, all HTTP request/response
examples, event examples and negative cases, WebSocket frames and OrderAction enum agreement with
current producer code. It does not run services, validate business authorization or certify network
reachability. Producer Checkpoint exposes only committedSequence; Chat ProjectionCheckpoint adds
projectedSequence. Producers must not guess a consumer's progress.

1. Each producer reviews paths/fields and publishes representative fixtures for its ownership.
2. Order implements full lifecycle events; User implements service/admin-eligibility boundary.
3. Chat/Notification consume the same Order lifecycle schema in different groups.
4. Chat evidence/auth integration unblocks Admin report/review; Kafka owner adapters unblock actions.
5. Run consumer-driven tests against real producers, real-broker retries and actual gateway/TLS
   configuration. Schema validation alone cannot certify cross-service functionality.
