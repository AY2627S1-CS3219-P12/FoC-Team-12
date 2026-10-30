# Admin Service

Owner: Darryl. Java 17 / Spring Boot 4.1.1, PostgreSQL/Flyway, React/TypeScript/Vite.
Scope: Admin backend/database/dashboard, current User eligibility, case-access callback,
participant reporting/status, administrator queue/detail/claim, evidence/conversation consumers
and durable credit-action tracking/Kafka adapters. See
[specification](../docs/integration/admin-service-spec.md) and
[integration drafts](../docs/contracts/README.md). Approval of this iteration does not
record Chat/transport owner sign-off or deploy the shared drafts.

## Behavior and boundaries

- `GET /api/admin/session` is the foundation's Admin-owned access endpoint. User bearer
  authentication plus effective ADMIN mode and a fresh persisted active/administrator
  check returns `{userId, role: "ADMIN"}`. Invalid identity is 401, denied access 403,
  unavailable account/key verification 503. No eligibility cache grants access.
- User implements `GET /internal/users/{userId}/admin-eligibility` for separately
  authenticated Admin/Chat/Credit services. It returns `userId, active, administrator`
  from its database, or 404. No email, credentials or profile data is returned.
- `GET /internal/admin/cases/{caseId}/access?actorId=&participantId=` accepts only
  authenticated Chat service identity. The existing draft's `CaseAccess` shape is used.
  Chat is the trusted delegator: it must first verify the original User identity and
  effective session role. A query parameter by itself is never a public authorization API.
- Active administrators may read case evidence and selected participant conversations;
  only the reviewer or the selected participant may write while UNDER_REVIEW. Participants
  cannot read evidence/other conversations; their returned participant list includes only
  themselves. OPEN/RESOLVED case conversations are not writable. Hidden/missing/inactive
  access is 404. User failure is 503. User eligibility completes before the current case
  state is read, so a case resolved during that check cannot reuse an older writable
  snapshot. No Chat call, permission lock or DB transaction is held across the remote check.
- Flyway creates only Admin-owned tables. V2 adds immutable participant statements, durable
  mutation receipts, case audit and lifecycle outbox. Existing V1 rows receive migration-time
  metadata and source sequence zero; no historical audit or participants are fabricated.
- `/admin` renders the shell. It uses the existing `foc.user-session` browser session,
  but trusts only the backend's check. It rechecks access every 30 seconds while open,
  clears protected UI on session replacement/expiry and distinguishes 401/403/503/network
  failures. Every future protected operation must still authorize on its backend.
  Visual conventions match User/Credit/Order: the green FoC bag mark, horizontal service
  navigation, account/workspace menu, shared color tokens, card shapes and mobile header.
  Workspace switching uses the existing User session-role API and rechecks Admin access
  with the returned token. A browser role selection never grants administrator access.

Shared Compose/gateway/broker/CI runtime wiring is prepared in the
[runtime integration guide](RUNTIME_INTEGRATION.md), pending affected-owner activation review.
Chat/Order/Credit domain code and Kubernetes policies are unchanged.
Conversation adapters and credit tracking are implemented; real owner integrations and resolution remain pending.
Account/supplier tools link to their existing owners.

## Cases behavior and APIs

| Endpoint | Access and outcome |
| --- | --- |
| `POST /api/admin/reports` | Current active REQUESTER/COURIER; `{orderId,description}`; 201 `{case,ownStatement}` |
| `GET /api/admin/reports/{caseId}` | Reporting participant only; own statement and case summary; unrelated users receive 404 |
| `GET /api/admin/cases?status=&query=&page=&size=` | Current active ADMIN; status enum, optional exact case/order UUID, page 0+, size 1–100/default 20 |
| `GET /api/admin/cases/{caseId}` | Current active ADMIN; `{case,statements,actions:[],resolution:null}` |
| `POST /api/admin/cases/{caseId}/claim` | Current active ADMIN; `{expectedRevision}`; OPEN becomes UNDER_REVIEW with caller as reviewer |

Reporting validates a trimmed 1–2000 character statement. It calls Chat's documented
`GET /internal/chat/orders/{orderId}/report-eligibility?userId=` using an Admin service
assertion plus the original JWT in `X-Actor-Token`. User ID comes from the JWT subject.
Chat owns requester/historical-courier policy; Admin never derives participation from Order
or reads other databases. Complete, nonempty producer checkpoints, no gaps and no projection
lag are required. Missing/mismatched/malformed evidence or unavailable Chat returns 503
without creating a case. Explicit complete ineligibility returns 403. No remote calls run
while a case or receipt transaction lock is held.

One case per errand and one statement per reporting participant are enforced by PostgreSQL
constraints and transaction locks. Another eligible participant joins the existing case;
another statement from the same participant conflicts. Resolved cases reject new reports.
Each accepted statement increments revision. Claims lock the case and check revision/state:
one competing claimant wins; stale/already claimed cases return 409. Other active admins
may read; the case-access callback grants administrator writes only to the assigned reviewer
while UNDER_REVIEW. Credit correction tracking is described below; bans and resolution remain deferred.

Every mutation requires a UUID `Idempotency-Key`. Receipts retain actor, route, canonical
body hash and original response in the same transaction. Same request replays that response
even if case state changed; another actor/route/body using the key conflicts. Current role
and account authorization are checked before replay. Validation and dependency failures
do not create receipts. Database commit uncertainty is retried with the same key. Browser
session storage retains uncertain operations per account and disables statement edits until
a definitive response. Do not clear browser storage to retry an uncertain operation.
Receipts have no automatic expiry in this iteration.

Each mutation persists a revisioned local audit record atomically. CaseOpened and CaseClaimed
also persist stable-ID `admin.events` envelope drafts in the outbox, keyed by case ID.
sourceSequence counts events separately from case revision. Adding a statement has an audit
record but no invented lifecycle event. No lifecycle Kafka relay is implemented: those outbox rows remain
pending until a later approved transport/relay iteration. Topic/ACL integration,
broker delivery and Chat consumption are not verified here. Draft schemas remain
subject to affected-owner review; local implementation is not Chat/transport sign-off.

`/admin` opens the live report queue first; account/supplier tools follow below it.
Open reports are selected by default. Status filters, exact case/errand ID search and page
are retained in the URL and in the case-detail return link. The UI-only `status=ALL` marker
represents the API's absent status filter; it is not sent to the API. `/admin/cases` remains
a compatible queue entry. `/admin/cases/{caseId}` has one styled return link to the queue.
Background eligibility rechecks preserve the current filters and page while successful;
denial/unavailability removes protected content. Every API request still authorizes locally.

Participant reporting is an errand workflow, not an administration tool. There is no Reports
item in Admin navigation, no mixed participant/admin subnavigation and no standalone UUID
entry or report lookup form. `/admin/reports/new?orderId={uuid}` accepts the selected errand
context and displays it without an editable ID field. Missing/invalid context shows a return
to My errands. This URL is context, never proof of participation: Chat must still authorize
the signed-in participant. Requester/Courier mode is required; Admin mode does not grant
participant access. A pending report for another errand must be resumed before a new report.
`/admin/reports/{caseId}` preserves the private status route and links back to its errand.

The actual Report an issue entry in the errand detail screen belongs to Order (XueTing) and
is not wired by this Admin-only change. The Admin receiving URL is available for local
testing; its use by Order still needs the affected owner's review. No Order code, gateway
routes or service API contracts are changed. Save the returned case link to revisit a report;
an errand-to-case lookup/list API has not been invented. Statements remain separate from
Chat's evidence timeline and must not be treated as the complete history.

## Credit corrections: Admin-owned tracking and Kafka adapter

This iteration implements the Admin side of the existing **draft** administrative Kafka contract.
Credit's correction consumer/ledger adapter is absent in this checkout. Topic/security/deployment
approval and real financial acceptance are still required; see [integration readiness](INTEGRATION_READINESS.md).
No balances or ledger rows are read/written by Admin and there is no synthetic live fallback.

- `POST /api/admin/cases/{caseId}/actions` takes the existing `CREDIT_ADJUSTMENT` shape:
  `targetUserId`, signed nonzero JSON-integer `amount`, trimmed `reason` (1–2000 characters),
  and UUID `Idempotency-Key`; returns 202 with the durable Action. This iteration rejects BAN.
  Supported amounts fit Credit's current signed 32-bit integer representation. Fractional, string,
  zero and out-of-range amounts are rejected, never rounded or truncated.
- `GET /api/admin/cases/{caseId}/actions/{operationId}` returns the persisted/derived current Action
  with no-store. Current active administrators may read; case detail includes the same action list.
  Participant report/status never includes actions, internal reasons or financial outcomes.
- Creation checks effective ADMIN mode/current active admin before its local transaction, then
  locks the case and requires assigned reviewer, UNDER_REVIEW and a verified reporting participant.
  Historical non-reporters remain gated by the existing historical membership ambiguity. There is
  no arbitrary target UUID input in the GUI. No HTTP or broker call holds a case database lock.
- Migration V5 stores action, immutable command payload, outcome inbox and private quarantine.
  One transaction commits operationId/eventId, case revision, audit, command outbox and original
  request receipt. Same actor/route/canonical body/key replays the original accepted response even
  if processing finished; status GET is authoritative afterwards. Different input/actor/route using
  that key conflicts. A new intentional correction requires explicit new review/confirmation.

State meanings:

| State | Meaning |
| --- | --- |
| PENDING | Admin accepted and persisted the request; Credit has not confirmed an outcome. This does not imply broker publication or a balance change. |
| UNKNOWN | The outcome deadline passed without confirmation. It may already have taken effect; it is not a rejection and must not be replaced automatically. |
| SUCCEEDED | A matching Credit-owned APPLIED outcome was validated and committed. |
| REJECTED | A matching Credit-owned REJECTED outcome was validated and committed, including its reason code. |

Deadline defaults to 30 seconds from acceptance (`ADMIN_ACTION_OUTCOME_TIMEOUT_SECONDS`). Reads derive
UNKNOWN from database time even with Kafka disabled; the publisher also persists overdue state.
Neither broker acknowledgement, a timeout, malformed input, DLT routing nor a generic error invents
a terminal financial outcome. A late valid result can finish PENDING/UNKNOWN; a recorded terminal
result cannot be reversed by a duplicate or conflicting message.

### Transport and reconciliation

Standalone `ADMIN_KAFKA_ENABLED` defaults **false**. Shared Compose prepares it as **true** with
authenticated broker access; activation requires affected-owner review as described in
[runtime integration](RUNTIME_INTEGRATION.md). Accepted requests remain durably queued, then become
UNKNOWN if no outcome arrives. The real Credit correction consumer/outcome producer remains pending;
broker acknowledgement never establishes a financial effect.
Admin service configuration accepts `KAFKA_BOOTSTRAP_SERVERS` (default localhost:9092) and standard
Spring Kafka SASL/TLS properties. The runtime integration adds shared Compose/env/CI/gateway wiring.

When explicitly enabled, the adapter publishes `AdminCreditCorrectionRequested` to
`admin.credit.commands`, keyed by targetUserId. Database leases are claimed in short transactions;
publication happens outside them. Acks=all/idempotent Kafka producer settings do not establish
exactly-once financial effects. After acknowledgement only delivery metadata changes. A timeout,
crash after acknowledgement or lease expiry can duplicate delivery; Credit must durably deduplicate
by operationId as well as event identity before its ledger effect.

The outbox retries failed/unconfirmed publication after 10 seconds. Unresolved commands are
re-delivered after `ADMIN_KAFKA_RECONCILE_SECONDS` (default 60, minimum 10), retaining identical
payload/event/operation identity. `ADMIN_KAFKA_OUTBOX_DELAY` defaults to 2000ms between batches;
one 30-second lease is claimed per batch and each send waits at most 10 seconds. Terminal actions
are excluded from new claims. No new operation or invented operation-lookup endpoint is created.
**Definitive reconciliation requires Credit to republish its original persisted outcome even for
a duplicate command whose effect was already committed.** If it only discards duplicate event IDs,
the missing outcome remains UNKNOWN. This owner requirement is not implemented in Credit here.

Admin consumes `credit.admin.events` in independent group `admin-service-credit`, manually
acknowledging only after persistence. It checks topic/key, producer/type/version/aggregate,
operation/case/order/target/requester/amount/correlation/causation, actor and typed outcome fields.
Inbox eventId plus canonical content hash deduplicates delivery. Matching result republication with
a new eventId is accepted without another terminal audit; a contradictory result is quarantined.
The terminal update, inbox, case revision, private audit and `CaseActionCompleted` lifecycle outbox
commit together. Producer evidence export now includes that fact with operation/target/result;
it does not expose private reasons, raw commands or ledger payloads. The existing `admin.events`
lifecycle relay remains a separate transport handoff; this adapter publishes only credit commands.

Invalid/conflicting outcomes are retained in private `admin_action_quarantine` and generate a
metadata-only `credit.admin.events.DLT` record before acknowledgement. Storage/DLT failures retry
twice at one-second intervals using the existing service transport convention, then the standard
recoverer routes the source record to the private DLT; failed DLT delivery must not advance offsets.
DLT does not mark a correction rejected. Quarantine/source retention and manual redrive policy need
owner agreement. The original source record remains identifiable by topic/partition/offset.
Only Credit's broker principal may publish outcomes: validating its `producer` string alone is
not authentication. Required ACLs, TLS/SASL and network policy remain shared-owner prerequisites.
Application identities must not auto-create/administer topics (`allow.auto.create.topics=false`).

Aggregate Micrometer meters track pending/unknown counts, oldest unconfirmed age, unpublished
commands and quarantined outcomes; failed metric reads are NaN, not zero. Existing health-only
Actuator exposure remains unchanged. Operational logs contain event/operation IDs and broker
metadata, not reasons, tokens or full financial message bodies. Private DLT/quarantine requires
restricted retention/access. Operators should investigate UNKNOWN age, delivery attempts,
`last_error` and DLT before any controlled redrive using original identity.

### GUI and verification boundary

Case detail offers Add/Subtract, a whole-credit amount, reporting participant and mandatory reason,
then a separate confirmation. It shows status and SGT timestamps. An uncertain browser submission
retains the exact key/body per actor/case in session storage, locks editing, and offers same-request
retry. Accepted actions are polled every five seconds by operationId; polling never submits another
correction. Read failures preserve last-known status with a warning; access denial hides protected
history/form. Other administrators can review history but cannot initiate. Changing case/account
unmounts the action panel. Invalid history disables creation instead of pretending it is empty.

Tests cover local atomicity/rollback, permissions, duplicate/concurrent creation, durable leases,
deadline/late outcome recovery, poison/conflict handling, inbox replay and lifecycle recovery export.
An isolated real Kafka/PostgreSQL test exercises command redelivery and the actual outcome listener
using a clearly test-only outcome producer. It does not implement or certify Credit arithmetic.
Financial-effect deduplication, insufficient-funds rejection and unchanged reserved credits must
still be demonstrated against Eldridge's actual Credit correction adapter. No mock result is claimed
as proof of a financial effect. Bans, resolution, shared infrastructure and Credit code are excluded.

Manual checks: review an addition/subtraction before confirming, interrupt/retry the same submission,
watch PENDING/UNKNOWN and late outcomes, switch participants/accounts, revoke access, verify only
the assigned reviewer can act, and inspect desktop/mobile keyboard use. Enable real Credit only
after the readiness gates; do not use an operator/manual financial correction as a recovery retry.

## Private case conversations: Admin-side preparation

Read [integration readiness](INTEGRATION_READINESS.md) before the final integration pass. It tracks
contract ambiguities, responsible owners, blocked iterations and completion checks across Chat,
Credit, Order, User and shared infrastructure. It is not approval of proposed interfaces.

`POST /api/admin/cases/{caseId}/conversations` consumes the existing documented Chat initiation
shape: required UUID `Idempotency-Key`, body `{participantUserId}` and a Chat-owned `Conversation`
response. Effective ADMIN mode, current active administrator eligibility, assigned reviewer and
UNDER_REVIEW state are required. The target must currently be a reporting participant, including
historical couriers who reported. Historical non-reporters are intentionally hidden until the
producer membership/callback contract is agreed. Browser IDs never establish participation.

Admin delegates to `/internal/chat/cases/{caseId}/conversations` using separate service auth,
the original User JWT and the same operation key/body. No database lock spans this call. A short
local transaction reserves global actor/route/body identity first; a provisional 503 receipt means
the outcome is unconfirmed. Retry after timeout/restart uses the same key. Chat owns deduplicating
that operation and its unique (case, participant) thread. After Chat responds Admin rechecks current
eligibility and locks/rechecks case permissions before confirming. A revoked actor or concurrently
closed case receives no conversation reference. A future reconciliation/read contract is still
needed for that accepted-but-unconfirmed Chat outcome; see the readiness file.

Migration V4 stores only Chat reference IDs keyed by case/reporting participant, never messages,
Chat memberships or read-only flags. First reference confirmation increments case revision and
atomically writes CONVERSATION_OPENED to the private audit. Repeated/concurrent confirmations
do not add duplicate references/audit entries. No new lifecycle event is invented. Successful
operation receipts replay only after current reviewer/state/target checks. A conflicting Chat
reference fails unavailable. 401/403/404/409 from Chat remain failures; malformed/redirect/network/
other responses are 503. Requests use two-second connect/three-second request bounds with no
automatic retries, redirects, logging of credentials, or synthetic fallback. Responses are no-store.

Assigned reviewers can select a reporting participant in case detail and initiate/open that
private thread. Other administrators and participants see honest pending-discovery states:
the contracts contain no case-to-existing-conversation lookup, and no such interface is invented.
Participant report status still exposes only its existing safe data and never another thread.
Historical non-reporter discovery/entry also awaits the agreed authorization path. Real Chat
does not yet exist in this checkout, so this is preparation, not verified live messaging.

The reusable thread UI consumes the documented Chat public reference/history/send APIs directly
with the User token. It validates case/order/participant/thread identity, message fields and ordered
pages, deduplicates identical overlap, and rejects conflicting/repeated/non-progressing pages.
Conversation changes unmount private history; denied access clears it. Read-only cases/current
Chat permission disable replies; permissions are re-fetched before sends. Original message text
and clientMessageId are held per account/case/thread in session storage for uncertain retries;
no optimistic delivery is shown. Text is displayed as text, never HTML. SGT timestamps use the
shared formatter. A refresh reloads authoritative REST history; browser retries retain opaque
cursors. The Admin-only Vite proxy forwards `/api/chat` to the existing gateway, whose actual Chat
routes still need a nominated shared editor. No gateway/shared config or Chat code is changed here.

WebSocket live notifications/reconnect, discovery, private image viewing/uploads and translation
are not implemented. Image messages show a non-downloadable attachment notice. Proposed limits,
cursor direction/catch-up boundaries and WebSocket ticket behavior require producer agreement.
Tests use explicitly test-only HTTP mocks; they cannot prove actual Chat persistence, access or
delivery. Final verification must use Eldridge's producer through real routing/trust configuration.

Manual checks when Chat is available: select each reporting participant as the assigned reviewer;
verify isolated messages and safe same-key initiation/send retries; refresh/load multiple pages;
revoke access/resolve during a request; confirm private history disappears on denial and replies
disable on read-only. Check narrow mobile layout, keyboard selection/composer, and SGT timestamps.
Participant and other-admin lookup must remain unavailable until the readiness gates are resolved.

## Evidence timeline and recovery

`GET /api/admin/cases/{caseId}/timeline?cursor=&limit=` requires effective ADMIN mode and
current persisted active administrator eligibility on every request. Admin looks up its own
case/order mapping, calls Chat's documented private timeline route with a short-lived service
assertion and the original User JWT, then rechecks current eligibility before returning data.
No transaction/permission lock spans the HTTP call. Limit defaults to 20, maximum 100. The
opaque Chat cursor is URL-encoded without interpretation. Requests time out after three
seconds (two-second connection limit); redirects/automatic retries are disabled.

Admin validates case/order IDs, snapshots, historical assignment periods, typed evidence,
source sequences, ordering, timestamps, coverage and gaps. Only documented redacted fields
are returned; unknown producer fields are not forwarded. Mismatched/malformed/unavailable
responses are 503; Chat snapshot conflicts become 409 with an explicit restart instruction.
Responses use no-store. User access failures remain denied/unavailable rather than being
converted into evidence completeness claims.

All Admin display timestamps use a shared formatter fixed to `Asia/Singapore`, with a readable
date, 12-hour time including seconds and an explicit SGT label, independent of device timezone.
This covers queue/case creation, statements, participant status, assignment periods, deadlines,
activity, ingestion and coverage checks. API timestamps and machine-readable time attributes
retain their original instants.

Case detail leads with readable activity summaries, Singapore occurrence times,
and participant relationship labels. Names/emails are not supplied by the timeline contract;
Requester and numbered Courier labels identify accounts within this snapshot, including repeated
assignment periods. Unknown actors remain explicitly outside supplied participant history; a
missing actor is not assumed to be a system action. Expandable technical details retain raw IDs,
broker streams, source sequences, ingestion times, revision and coverage checkpoints. These are
collapsed by default even for incomplete evidence; known gaps and projection lag remain visible
in plain language. No additional API or identity lookup is introduced.
COMPLETE also requires that the snapshot requester/current courier appear in the supplied
participants. It is accepted only with no blocking gaps, no lag and checkpoints for the documented
Order, Credit and Admin streams/aggregates. The label says complete *through those
checkpoints*, never globally current forever. UNKNOWN/INCOMPLETE and empty evidence remain
explicit. Loading fewer pages does not imply missing source coverage, and reaching the last
page does not prove complete history. Snapshot revision/metadata changes, conflicting IDs,
out-of-order pages or non-progressing cursors require restarting; overlapping identical IDs
are deduplicated. Failed pagination keeps prior records marked unverified and retries the
same cursor; authorization denial clears protected evidence.

`GET /internal/admin/orders/{orderId}/evidence?caseId=&cursor=&limit=` is a private Chat-only
producer export. Service identity is pinned using the existing separate service-key trust map;
User JWTs and other services cannot authenticate. caseId is required and must match orderId.
This read does not call Chat/User or depend on Kafka publication, preventing recovery cycles.

The first read pins a repeatable PostgreSQL snapshot of the case's committed lifecycle
outbox records and high-water mark. Stable event IDs/source sequences and occurrence/local
persistence timestamps are preserved. Export ingestedAt denotes Admin's original local
persistence time; it is not an invented Chat ingestion timestamp. EvidenceData uses the
documented ADMIN shape. Internal statement text, eligibility revisions, request receipts,
credentials and arbitrary outbox fields are excluded. Statement-only audits have no
invented lifecycle event. This iteration exports CaseOpened/CaseClaimed; later producer
event types must extend the adapter with their owning iteration.

Migration V3 persists immutable recovery snapshots and opaque cursor UUIDs. Each next cursor
binds the snapshot, offset and page limit; retries return the same snapshot/checkpoint/records
and next cursor after new case mutations or restarts. Default page size 20, maximum 100;
keep the same limit on subsequent pages. A fresh cursorless request obtains a new snapshot.
Producer checkpoints expose committedSequence, never projectedSequence. Unknown cursor is
409, malformed cursor/limit is 400, cross-case/order lookup is 404. Cases lacking a trustworthy
CaseOpened baseline or contiguous durable events return 503: legacy history is never
fabricated, and recovery remains incomplete. Snapshot/cursor expiry or cleanup is not automatic
in this iteration; retention requires a separately agreed recovery policy.

All producer/consumer schemas remain the repository review drafts until affected owners sign
off. Chat still has no runnable repository implementation. HTTP fixtures verify the Admin
adapter and UI only; they are not proof of real historical participation, producer coverage,
broker delivery or operational recovery. No Chat code, contract schema, gateway, Compose,
broker or other service is changed by this iteration.

Evidence verification: run the backend/frontend commands below. Tests cover current access,
revocation during HTTP, cross-case rejection, incomplete/unknown/contradictory coverage,
snapshot paging/retry, HTTP failure mapping, redaction and PostgreSQL export consistency,
stable identities, unavailable legacy baselines and gaps. Manual: open a case in ADMIN mode,
inspect participant periods/checkpoints/gaps, load multiple pages, interrupt Chat and retry,
change snapshot revision between pages, revoke administrator access, and check keyboard/focus,
375px and desktop layouts. Real Chat integration and visual acceptance remain pending when
the producer runtime or browser access is unavailable.

## Local configuration and startup

Local defaults are backend 8084, Vite 5177, isolated database loopback 5544. These are
development choices; shared deployment ports/routes still require nominated-editor review.
Use PowerShell 7 and Java 17+; all commands below are from the repository root.

```powershell
. ./admin-service/Initialize-LocalAuth.ps1
# Supply an independently chosen database password; do not commit it.
$env:ADMIN_DB_PASSWORD = Read-Host 'Local Admin database password' -MaskInput
$env:ADMIN_DB_PORT = '5544'
docker compose -p foc-admin-foundation -f admin-service/compose.local.yaml up -d --wait
```

Start User using its normal private database and User signing configuration, inheriting
`USER_SERVICE_TRUSTED_KEYS` from this shell (or supply that public-only JSON to its own
launch environment). Start Admin inheriting `ADMIN_SERVICE_PRIVATE_KEY` and
`ADMIN_SERVICE_KEY_ID`; neither service is restarted by the initialization script.

```powershell
cd admin-service/frontend
npm ci
npm run build
cd ..
./mvnw.cmd spring-boot:run '-Dspring-boot.run.arguments=--server.address=127.0.0.1'
```

In a separate terminal run `npm run dev` from `admin-service/frontend`, then open
`http://127.0.0.1:5177/admin`. The dev server proxies Admin/User API requests and User UI
query routes to their local services so login and Admin share a browser session origin.
User must have its frontend built. Sign in, select Admin mode in the User profile, then
return to `/admin`; the existing User login does not automatically redirect to Admin.
Supplier links use the existing gateway on 8088. The packaged Admin shell uses the
prepared shared gateway routes for User/account/supplier links after runtime activation; direct backend hosting alone
does not provide a second login system.
Set `VITE_USER_URL` before starting Vite when testing a User instance on another local port.
The preview forwards `/` (including query routes) to User and routes Supplier admin APIs
before the general Admin API prefix. Supplier/Credit/Order APIs use the existing gateway.
All participating services must trust the same User signing identity. A disposable User
on another port with a different key can verify Admin in isolation, but its tokens cannot
authenticate to Supplier configured against the normal User JWKS. Do not weaken validation
or copy signing keys to hide this mismatch; use one consistent User runtime for integrated
testing. Supplier's own navigation/header changes remain Supplier-owned work.

The user-requested shared navigation update adds an `Admin` link to `/admin` in the
User, Supplier, Credit and Order top navigation while the effective role is ADMIN.
Editor: Darryl for this navigation integration; affected reviewers: Darryl (User/Admin),
Jun Hui (Supplier), Eldridge (Credit), XueTing (Order). These links do not grant access:
Admin verifies the JWT and current administrator eligibility. No service APIs or gateway
configuration change with the tab. Rebuild each owning frontend/container to display it;
the prepared shared gateway integration still requires affected-owner review before activation.

Configuration:

| Variable | Purpose |
| --- | --- |
| `ADMIN_DB_HOST/PORT/NAME/USER/PASSWORD` | Admin-only database; defaults localhost/5432/admin_db/admin_user, password required |
| `ADMIN_PORT` | Backend local port, default 8084 |
| `ADMIN_USER_URL` | Private User base URL, default http://localhost:8081 |
| `ADMIN_CHAT_URL` | Chat eligibility base URL; local default http://localhost:8085; configure the actual producer, otherwise reporting fails closed |
| `ADMIN_USER_JWKS` | User JWKS URL; issuer friend-on-campus-user-service, audience friend-on-campus-api |
| `ADMIN_SERVICE_PRIVATE_KEY`, `ADMIN_SERVICE_KEY_ID` | Separate Base64 PKCS#8 RSA signing key and kid for outgoing service assertions |
| `ADMIN_SERVICE_TRUSTED_KEYS` | Public-only JSON trust map for incoming Chat assertions; default `{}` denies all |
| `USER_SERVICE_TRUSTED_KEYS` | Same trust-map format on User, allowed subjects admin-service/chat-service/credit-service |

Trust-map format: `{"chat-key-1":{"subject":"chat-service","publicKey":"BASE64_X509_RSA_PUBLIC_KEY"}}`.
Pin each key to its service identity; never pin a User signing key here. Assertions require
RS256, issuer `foc-service-auth`, receiving-service audience, matching subject/kid, iat/exp
with lifetime at most 60 seconds and nonblank jti. At most five seconds future issuance
skew is allowed; expired assertions are rejected. Service assertions are short-lived,
not a single-use protocol. No credentials are logged or included in errors.

Outgoing User calls have a 2-second connect/3-second request timeout and never follow
redirects or automatically retry. A new read can be retried without side effects; failures
remain unavailable. Missing signing configuration likewise fails closed. Production must
configure HTTPS for User/JWKS/private service calls, separate secrets and trust rotation.
Default-deny network ingress AND egress changes remain a separate deployment prerequisite.

The standalone database persists in `foc-admin-foundation_admin-data`; ordinary stop/start
preserves it. Keep the same database password when reusing that volume. To stop without deleting data:
`docker compose -p foc-admin-foundation -f admin-service/compose.local.yaml stop`.

## Verification and manual acceptance

```powershell
cd admin-service
./mvnw.cmd test
cd frontend
npm test
npm run build
npm run lint
npm run format:check
```

The PostgreSQL test uses an isolated Docker container and is skipped when Docker is absent;
such a run does not verify PostgreSQL. JWT tests sign real RS256 tokens and serve test JWKS.
User regression checks: run `./mvnw.cmd '-Dtest=AdminEligibilitySecurityTest,ServiceTokensTest,AdminLifecycleSecurityTest' test`
inside `user-service`. Callback tests use test-only case fixtures; Chat has no runtime yet.

Manual: open `/admin` without a session, with Requester/Courier mode, then with active
Admin mode. Check sign-in/denied/authorized states and account links. Revoke Admin access
or ban the account and verify recheck denial. Interrupt User access and verify unavailable
with retry. Check keyboard focus/skip link, mobile width and desktop layout. These foundation
checks do not establish case workflow or cross-service deployment readiness.

Cases tests cover PostgreSQL first-report/same-key/competing-claim races, one case/statement,
stale revisions, revoked access, private status, rollback on outbox failure, receipt conflicts
and ordered lifecycle envelopes. HTTP tests check role separation, validation and private
wire shape. Chat client tests serve a test-owned HTTP fixture using the documented eligibility
shape and check delegation, coverage, lag, gaps, malformed responses and outages. These
fixtures do not verify real historical assignments or deploy a replacement Chat service.

Manual cases acceptance: with an owner-provided Chat runtime/contract fixture, submit in
Requester/Courier mode, save the case ID, join as a second eligible participant and confirm
each sees only their own statement. Check unrelated/ADMIN-mode participant denial, duplicates,
empty/filtered/paged queue and two admins claiming the same revision. Refresh after 409;
verify only the winner is reviewer. Interrupt Chat before reporting and User before protected
operations; confirm unavailable/denied feedback without success. Check a dropped response,
reload with a pending request, keyboard/focus, desktop and mobile layouts. Real Chat integration
and manual visual acceptance remain pending when that runtime or browser access is unavailable.

### Explicit local eligibility fixture

For manual UI testing before Chat exists, the test source `ReportEligibilityFixture` serves
only the documented eligibility route for one supplied errand UUID and participant allowlist.
It validates Admin service assertions and original User JWTs, but its eligibility/checkpoint
facts are synthetic. It never reads Order or changes User/Chat data. It is outside component
scanning and excluded from the application jar; no runtime fixture mode exists in Admin.

Run the Admin tests first, then in a shell with the same local Admin signing configuration
and User JWKS configuration as the backend:

```powershell
./admin-service/Start-EligibilityFixture.ps1 -OrderId <fixture-errand-uuid> -ParticipantIds <requester-user-uuid>,<courier-user-uuid>
```

Obtain User IDs from your own local accounts. Use a dedicated synthetic errand UUID, not a
real errand. Set `ADMIN_CHAT_URL=http://127.0.0.1:18085` in the Admin startup shell and restart
Admin. For local testing open `/admin/reports/new?orderId={fixture-errand-uuid}`. The normal
product entry belongs on the errand screen. Accounts outside the allowlist are
ineligible. `-Incomplete` deliberately returns lagging coverage; stop/restart the fixture to
test Chat outages. Stop with Ctrl+C. Remove the override before connecting real Chat.
Success against this fixture is local UI/API verification only, never Chat integration sign-off.

After creating a synthetic case, the same launcher accepts `-CaseId <case-uuid>` to serve
an explicitly labelled, 25-record synthetic timeline for that one case/order. Both service
and original Admin User JWTs are checked. The fixture is still test-only and excluded from
the packaged application. Use `-Incomplete` to show projection lag and known gaps, and stop
it to verify unavailable/retry behavior. This synthetic timeline is not derived from real
Order/Credit history and must not be used to make real case decisions.
