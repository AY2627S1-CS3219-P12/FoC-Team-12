# Chat Service blueprint

Shared proposed wire shapes and fixtures: [contract package](../docs/contracts/README.md).

The latest Kubernetes isolation rules block new Chat connections until a reviewed network-policy
change enables the caller/destination matrix in that package. Include Kafka, User JWKS/eligibility,
Admin callback, producer evidence exports, private DB/Redis and AWS HTTPS in deployment planning.

Owner: **Eldridge**. Status: planned N2H; documentation only, no runnable scaffold. Source: D3
slides 10-14, D1 N2H1 and agreed Admin integration. Product scope is agreed; new API shapes,
storage limits and security adapters are proposals for owner review before implementation.

## Scope, ownership and architecture

Provide private errand chat, text/images, real-time delivery, translation preserving originals,
separate admin-participant case conversations and an event-derived errand timeline for Admin.
Chat exclusively owns its PostgreSQL conversations/permissions/messages/translation/timeline
projection. Images live in private S3 object storage; Redis caches translations. Chat never
calculates credit changes, bans users, decides Order transitions or writes another service DB.

Browser -> Gateway -> Chat REST/WebSocket; Admin -> Chat authenticated internal HTTP(S). Kafka
facts -> Chat inbox/projection. Use Java 17/Spring Boot/Maven/Flyway/OpenAPI and existing frontend
conventions. Do not expose internal evidence endpoints at the gateway. Translation uses Amazon
Translate via AWS SDK per D3; secrets come from deployment configuration, not bundles or images.

Read [Chat/Admin contract](../docs/integration/chat-admin-contract.md) for canonical internal paths,
timeline coverage, identity checks and recovery; [Admin spec](../docs/integration/admin-service-spec.md)
for case ownership; [core events](../docs/integration/event-communication-blueprint.md) for existing
wire formats. Do not duplicate these contracts with independently chosen payload names.

## Conversation types and authorization

| Type | Participants | Writable condition |
| --- | --- | --- |
| ERRAND | Requester and currently assigned courier | Accepted errand, until terminal state; exact assignment policy below |
| CASE | Assigned admin reviewer and one historical case participant | UNDER_REVIEW case and currently permitted participants |

One logical ERRAND chat per errand, created when it first becomes ACCEPTED. On terminal state,
preserve read-only participant history; reject new messages/uploads without mutation. Unrelated
users cannot enumerate messages, identities or image metadata. Admin entitlement alone does not
grant access to the ordinary errand chat: use separate authorized case conversation/evidence paths.

Assignment changes are a privacy decision not fully specified by D3. Proposed conservative rule:
keep one conversation ID but segment messages by assignment epoch; requester sees all its epochs,
courier only its own epoch. New courier cannot read the former courier's messages. Former courier
has read-only access to its epoch after withdrawal; current courier alone can write. This extends
D3's 'assigned courier' rule to historical read access and requires explicit team approval before
implementing reassignment/history exposure. Do not silently grant new couriers full history.
Until approved, stop that feature boundary; other scaffold/contract work can proceed.

Case conversations are unique by caseId/participantUserId and isolated from each other. Use the
existing Admin contract for reviewer checks, historical participants and resolved read-only state.
Do not lock case conversation merely because its errand reached a terminal state. Permission
revocation applies to REST, WebSocket subscriptions, message sends and attachment downloads.

## Kafka projection and evidence

Subscribe independently as `chat-service-timeline` to the topics in the Chat/Admin contract.
Order lifecycle stream requires full accepted/assignment/withdrawal/pickup/delivery/terminal facts,
not just the existing five Order credit commands. XueTing owns producer changes/checkpoints.
Credit retains ledger truth, Chat stores approved evidence copies; Admin/User outcomes are
case/operation-scoped. No claim that all User actions are already published.

Commit inbox + projection/permission changes atomically before ack. Same event ID/content is a
no-op; conflicting content is retained/rejected. Preserve historical delayed evidence. Use source
sequences/checkpoints to detect gaps; keep coverage UNKNOWN/INCOMPLETE until reconciled. Message
sequence is Chat-owned and separate from source lifecycle sequence. Never expose Kafka offsets as
proof of global completeness. Fail closed on unproven participant access when projection lags.

Producer history backfill restores missing records with original IDs/sequences; it does not
re-emit financial operations. Follow canonical export/checkpoint proposals in the shared contract.
Private timeline fields and admin notes are not ordinary chat messages. Evidence remains append-only.

## Proposed public REST and WebSocket contract

Gateway proposed prefixes `/api/chat/**`, `/ws/chat`, UI `/chat/**`; nominated gateway editor must
approve paths/port before wiring. Validate User JWT signature/issuer/audience/expiry/sub and
resource membership on each operation. Shared Admin service-auth profile applies to internal APIs.

| Method/path | Input/output |
| --- | --- |
| GET /api/chat/orders/{orderId}/conversation | Authorized ERRAND conversation reference and readOnly |
| GET /api/chat/conversations/{conversationId} | Authorized conversation reference, including CASE chats |
| GET /api/chat/conversations/{id}/messages?cursor=&limit= | Authorized paginated ordered message history |
| POST /api/chat/conversations/{id}/messages | clientMessageId UUID; text or owned uploaded attachment reference; stored message |
| POST /api/chat/conversations/{id}/attachments | Authorized upload initiation/validation; attachment ID and restricted upload details |
| POST /api/chat/conversations/{id}/attachments/{attachmentId}/complete | Validate stored object and mark attachment READY before message reference |
| GET /api/chat/conversations/{id}/attachments/{attachmentId}/download | Recheck membership; short-lived private download URL |
| POST /api/chat/conversations/{id}/messages/{messageId}/translations | targetLanguage; existing/pending translated result |
| GET /api/chat/conversations/{id}/messages/{messageId}/translations/{language} | Original retained; translation status/content |

These are proposed path signatures. Eldridge publishes exact OpenAPI schemas plus browser fixture
examples before Admin/Order UI implementation depends on them. History page default 20/max 100.
Message response includes id, conversationId, senderUserId, sequence, createdAt, text nullable,
attachment metadata nullable. Sort/paginate by immutable per-conversation sequence. Sender comes
from verified actor, never supplied body. Proposed limits: 1-4000 text characters; one JPEG/PNG/WebP
image <=5 MiB per message. Owner/team approve limits and supported languages in analysis.

Server assigns sequence and commits message before responding/broadcasting. Unique
(conversationId, senderUserId, clientMessageId); same content returns original message, different
content returns 409. Exactly one stored message despite transport retries. Database is delivery
truth; WebSocket reconnection fetches missing messages by sequence. Broadcast fan-out must work
across replicas; proposed Redis pub/sub only signals delivery, never replaces durable history.

WebSocket authenticates at connection and checks membership on subscribe/send. Do not put access
tokens in URLs. Prefer an authenticated HTTP-issued single-use, short-lived WebSocket ticket;
ticket protocol needs Chat-owned contract tests. Message delivery can be WebSocket while mutation
uses REST; both share the same authorization and idempotency rules. 401 invalid identity; 404
hidden/missing conversation; 409 read-only/idempotency conflict; 413 oversize; Problem Details on REST.

## Images, translation and privacy

Private S3 bucket, server-generated keys scoped by conversation/upload; do not accept arbitrary
object URLs as owned attachments. Validate byte size and actual media signature, not extension.
Pending/failed uploads cannot be messaged; clean up abandoned uploads under an approved retention
policy. Presigned URLs expire quickly; revocation stops new downloads, but already issued URLs
remain usable until their short expiry. Do not promise instant revocation of an issued URL.

Translate text only when explicitly requested for an allowed target language; persist original
unchanged and translation state PENDING/READY/FAILED in PostgreSQL. Unique message/language/
provider-version prevents duplicate jobs. Redis caches completed results; cache misses fall back
to DB. Notify authorized subscribers when translation completes. Provider failure retries boundedly
and leaves original readable. User text is sent to AWS Translate: disclose this in the UI/privacy
notice and restrict AWS permissions; no images or unrelated private data sent for translation.

Do not implement message editing/deletion, arbitrary admin browsing, voice/video, email/SMS or a
second ledger/logging backend. Retain terminal chat/case history; exact retention periods, user
deletion policy and object lifecycle need approval before automatic cleanup. Do not manufacture
numeric Chat performance commitments absent from the D3 requirements.

## Verification and staged implementation

Automated: requester/courier isolation, reassignment epoch policy after approval, terminal read-only,
cross-case admin conversation denial, invalid/stale identity, concurrent message sequence, duplicate
send/conflict, reconnect recovery, invalid/oversize upload, private download, translation cache/
provider failure, duplicate/out-of-order Kafka evidence and full backfill recovery. Real-broker
integration must demonstrate events create permissions and evidence without manual DB writes.

1. `$foc-iterate-feature chat-service-contract: Approve participant-history policy, public schemas and shared timeline fixtures.`
2. `$foc-iterate-feature chat-service-foundation: Scaffold Chat database/backend/frontend and authenticated conversation shell.`
3. `$foc-iterate-feature chat-service-lifecycle: Derive conversation membership and read-only state from approved Order events.`
4. `$foc-iterate-feature chat-service-messaging: Deliver durable text messages and paginated/reconnecting live chat UI.`
5. `$foc-iterate-feature chat-service-images: Add authorized private image uploads and message attachments.`
6. `$foc-iterate-feature chat-service-translation: Add original-preserving translation with durable outcomes and Redis cache.`
7. `$foc-iterate-feature chat-service-evidence: Provide Admin timeline/eligibility, checkpoints and backfill APIs.`
8. `$foc-iterate-feature chat-service-case-conversations: Integrate isolated live admin-participant conversations.`
9. `$foc-iterate-feature chat-service-acceptance: Verify privacy, restart/replay, real-broker integrations and deployment checks.`

Timeline iteration can run before translation to unblock Darryl; do not make Admin depend on the
external translator. XueTing owns Order event completeness, Darryl owns case-access/admin-eligibility
contracts, Jun Hui owns broker/ACL/DLT and shared wiring. Add CI commands when runnable code exists;
no build/test command is currently available in this documentation-only folder.
