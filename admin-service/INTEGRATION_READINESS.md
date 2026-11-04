# Admin integration handoff and unresolved decisions

Read this file before final integration/acceptance and update each item with producer evidence.
Requested by Darryl during the conversations iteration. This tracks dependencies, not new product
requirements or approval of draft interfaces. Product scope remains in the Admin specification;
wire shapes in `docs/contracts/` remain review drafts until the affected owners agree them.
Never replace an unavailable dependency with synthetic data in application code.

## Current boundary

Admin owns cases, statements, reviewer/state, audit, request receipts and its private database.
Chat (Eldridge) owns historical timeline, conversations, messages and all Chat access checks.
Admin implements consumers against existing documented shapes; this does not certify a producer
implementation. At this iteration's start Chat contains documentation only. No live Chat
integration, gateway deployment or end-to-end conversation acceptance has passed.

## Contracts and conversation gaps

| Item / owner | Decision or implementation still required | Blocks | Completion evidence |
| --- | --- | --- | --- |
| C1: Chat/Admin wire approval — Eldridge + Darryl | Confirm exact paths/shapes, error meanings, actor delegation, UUID idempotency scope, duplicate/mismatched operations, retry ownership and representative paired fixtures. Schemas/examples alone are not approval. | Evidence/conversation integration and final acceptance | Owner-agreed version and consumer tests against the actual producer, including mismatches and lost responses. |
| C2: Conversation discovery — Eldridge (producer), Darryl (consumer) | Current contracts can initiate a case conversation or read one by known ID. They do not define lookup/list by case for the selected participant or other reviewing administrators. Agree a read-only discovery mechanism, hidden/not-started versus unavailable outcomes and privacy filtering. Do not let participants use the reviewer-only initiation POST as lookup. | Participant conversation view, other-admin review, reopening existing threads after reload | A participant discovers only their own ID; another admin discovers only permitted case threads; unrelated users cannot enumerate; no initiation side effect on lookup. |
| C3: Historical non-reporter authorization — Eldridge + Darryl; XueTing supplies historical facts | Current Admin callback authorizes local reporting participants. Agree how trusted historical membership is established/persisted before callback checks, with no circular Admin→Chat→Admin evidence call or HTTP under DB locks. Do not treat browser-supplied IDs, current courier alone or incomplete projections as history. | Conversations with historical participants who did not report; safe participant entry for those users | A withdrawn historical courier without a statement can access only their intended conversation; arbitrary users and unverifiable history remain denied/unavailable. Callback works when Chat evidence is down without recursion. |
| C4: Actual Chat conversation/message implementation — Eldridge | Implement one thread per (case, participant), current authorization on REST/WebSocket/images, server-assigned message sequence, clientMessageId deduplication, read-only state and durable recovery. Pin create retries to original actor/body/key and retain original identities. | Live reviewer/participant messaging | Real service tests for retries after commit/lost reply, concurrent creation/sends, revocation, cross-case/thread denial and resolution while sending. |
| C5: Browser delivery and routing — Eldridge + nominated shared editor (Jun Hui); affected owners review | Confirm `/api/chat/**` and `/ws/chat` routes, runtime addresses, JWT trust, HTTPS/CSP and ticket lifecycle. Draft ticket/subscription frames are not a deployed WebSocket. Define history catch-up boundaries/cursor direction and reconnect behavior using actual Chat. | Real-time delivery, direct browser Chat calls and deployed conversations | Gateway/WS tests, REST catch-up without missing/duplicate messages, expired/revoked tickets rejected. Admin dev proxy points only to the existing gateway; no shared routes are changed here. |
| C6: Attachments, translation and ordinary errand chat — Eldridge + product owners | Confirm supported limits/languages and historical/replacement-courier visibility for ordinary chat. This policy is separate from private case threads. Upload, download and translation UI are excluded from this Admin iteration. | Later media/translation work and ordinary-chat integration | Owner-approved policy and producer schemas plus authorized private attachment/translation tests; no arbitrary external URLs/keys. |
| C7: Accepted-but-unconfirmed initiation — Eldridge + Darryl | If Chat commits a conversation but Admin loses the response, cannot save its reference, or observes revocation/closure afterwards, the local request remains unconfirmed. Retry uses the original key; no background reconciler or lookup is invented. Agree reconciliation/discovery and read-only replay behavior after closure, plus receipt/reference retention and audit semantics. | Reliable recovery across closure/revocation/restarts and complete conversation acceptance | Original reference is recovered by authorized read without creating a duplicate or allowing a post-close write; revoked actors see no private reference; owner-agreed retention and observable reconciliation outcomes. |

Admin conversations preparation deliberately supports initiation only for reporting participants,
including previously eligible historical couriers. An unknown/non-reporting target is hidden;
the UI explains the pending historical integration. Participant and other-admin discovery remain
explicitly unavailable. No guessed endpoint or editable conversation-ID input bypasses these gaps.
The reusable thread UI is prepared for a validated reference but is not wired to participant
discovery until C2/C3 are agreed. It uses REST refresh/pagination and safe retry; WebSocket
notifications/reconnect remain pending C5. Browser pending keys/text are scoped to account/case/
thread in session storage. No message content is stored in Admin's database.

## Evidence, identity and infrastructure dependencies

| Item / owner | Remaining work or ambiguity | Blocks | Completion evidence |
| --- | --- | --- | --- |
| E1: Complete Order history — XueTing | Publish full lifecycle/assignment facts and producer-owned stable recovery snapshots/checkpoints, including withdrawn couriers and historical locations. Agree pre-stream baseline policy. | Historical reporting/conversations, complete timeline, resolution | Initial/edit/accept/withdraw/pickup/delivery/terminal scenarios recover with original identities and contiguous evidence sequences; missing legacy facts remain explicit gaps. |
| E2: Credit evidence — Eldridge | Confirm order-linked ledger outcome/export shapes, stable evidence sequence for existing core events and case-scoped correction history. Do not silently add fields to deployed core messages. | Complete timeline, financial review/actions and resolution | Reconciled producer checkpoints and ledger effects; duplicate replay does not repeat a financial effect; unavailable history is UNKNOWN/INCOMPLETE. |
| E3: Admin event delivery/recovery — Darryl + Jun Hui for transport | Admin outbox has CaseOpened/CaseClaimed; broker relay/ACL/topics/replay remain deferred. Conversation reference audit does not invent a new lifecycle event. Agree durable relay/reconciliation and private export retention/expiry. Exports preserve original IDs/checkpoints; Admin export ingestion time is local persistence time. | Chat projection of Admin activity, complete timeline, final acceptance | Real-broker publish/retry/restart/recovery tests, original IDs retained, no gaps/duplicates; agreed snapshot retention and expired-cursor outcomes. |
| E4: Coverage semantics — Eldridge + Darryl + affected producers | Confirm per-source committed/projected checkpoints, gap classifications, pinned timeline revision and pagination. A running Chat or empty page never establishes complete history. | Evidence verification and resolution guards | Late/out-of-order/conflicting events, backfill overlap, checkpoint outage and producer lag tested; COMPLETE only through explicit verified limits. |
| I1: Current User eligibility and role delegation — Darryl (User owner), Eldridge (Chat consumer) | Admin's User checks exist; verify actual Chat JWT/service trust and current active/admin checks. Keep effective participant mode separate from Admin access; propagate revoked/unavailable identity safely. | All privileged integration and conversation authorization | Revocation during requests, inactive participant, mode changes, wrong key/audience/subject and User outage tests across real services. |
| I2: Shared deployment — nominated editor, Jun Hui coordinates; all affected owners review | Gateway/Compose/env/CI, service DNS/TLS, signing-key distribution/rotation, broker access and both ingress/egress default-deny policies need coordinated implementation. Required Compose variables must also reach env examples, Compose CI jobs and Kafka smoke checks. | Deployed N2H, live Chat and final acceptance | Actual gateway/TLS/network/broker smoke checks and compose_env_check pass; no public exposure of internal APIs. |
| A1: Commands/outcomes — Darryl (Admin/User), Eldridge (Credit), Jun Hui (transport) | Confirm approved action envelopes, command deduplication, persisted outcomes, failure/retry/reconciliation and observability before actions iteration. | Admin actions and resolution | Pending/unknown/rejected/applied outcomes tested with real producers, insufficient-credit and self/final-admin protections preserved. |
| A2: Resolution/read-only — Darryl + Eldridge | Admin implements atomic closure with fresh complete evidence, current case checkpoints, no pending/unknown actions and per-rejection explanations. Chat must still implement/recheck closure on writes, not trust an old UI flag. | Real Chat resolution and full workflow acceptance | Admin decision/retry/race/privacy checks use test-only Chat evidence; actual concurrent Chat closure/send and readable private history remain pending. |

## Final integration exit checks

### Credit-actions iteration handoff

Admin now implements the draft credit-action API, durable actions/command outbox/outcome inbox,
reconciliation by original command redelivery, conditional Kafka transport, audit/lifecycle export,
and reviewer GUI. This updates the Admin portion of A1; it does not close A1, E2, E3 or I2.
Standalone Kafka is disabled by default. The shared runtime iteration now enables authenticated
Admin transport in Compose and prepares topics/ACLs, gateway routing and CI. Activation remains
gated on affected-owner review; see [runtime integration](RUNTIME_INTEGRATION.md).
Non-reporting historical targets remain gated by C3. Bans and resolution remain separate work.

The isolated runtime smoke now passes against packaged Admin/User/gateway images, private
PostgreSQL and authenticated Kafka: real User JWT/current eligibility, internal-route isolation,
command publishing, UNKNOWN/original retry identity, test-only duplicate rejected outcomes,
restart persistence and User outage. This closes the local Admin transport/configuration portion
of I2 only. It does not close shared activation review, Kubernetes/TLS/network-policy deployment,
real Credit acceptance, Chat integration or the Admin lifecycle relay in E3. Test-only SQL fixtures
and outcome producers are not live fallbacks and do not establish a Credit ledger result.

The separate shared-broker smoke also passes topic/retention checks, repeated initialization,
scoped producer/consumer access, denied Admin outcome forgery and foreign-group access,
authenticated read-only operational UI, and record/configuration/ACL persistence after restart.
These checks use a disposable broker. The existing shared broker is intentionally not activated;
its administrative topics remain absent until affected-owner review and coordinated rollout.

- **Eldridge / Credit:** approve and implement `AdminCreditCorrectionRequested` and its applied/
  rejected outcomes, including all identity/correlation/amount fields, current actor eligibility,
  target account validation, signed integer limits and authoritative ledger arithmetic. Confirm
  the chosen int32 request representation against Credit's existing int balances.
- **Eldridge / Credit recovery:** persist effect, operation hash/result, inbox and outcome outbox
  atomically. Admin resends identical event/operation IDs. Credit must republish the original stored
  outcome on duplicate commands, not merely drop a duplicate inbox entry. A lost outcome with a
  committed effect must converge without a new effect or a new operation. No lookup API is assumed.
- **Darryl + Eldridge:** agree deadline/reconciliation cadence and retention/redrive rules. Admin's
  30-second UNKNOWN deadline is an engineering default, not failure proof. Agree conflicting-result
  quarantine/DLT investigation and original completedAt preservation for result republication.
- **Jun Hui / nominated shared editor:** provision the command/outcome/DLT topics and independent
  consumer group ACLs (only Credit writes Credit outcomes), TLS/SASL/connectivity and runtime config.
  Validate both directions of default-deny network policy and preserve existing core topics/groups.
- **Darryl + Eldridge integration:** prove one ledger effect under duplicate events/operations,
  insufficient available-credit rejection and unchanged reserved balance in the real Credit DB
  through producer-owned tests/APIs. Admin's broker/fixture tests cannot establish these facts.
- **Darryl / later resolution:** share the same case lock and forbid closure over PENDING/UNKNOWN.
  Late matching outcomes finish their recorded actions; they never originate another command.
- **Darryl + Jun Hui:** publish/recover CaseActionCompleted alongside existing lifecycle outbox.
  The Admin correction transport intentionally does not introduce the wider admin.events relay.

### End-to-end exit checks

- Re-read this file and current producer contracts; mark an item complete only with owner agreement
  and actual implementation/test evidence. Record the agreed version/PR and any remaining gap.
- Replace test-only servers with configured real producers and exercise requester, historical
  couriers, assigned reviewer, another administrator and unrelated/revoked accounts.
- Verify C2/C3 before enabling participant discovery or non-reporting historical targets.
- Confirm durable operation identities and original receipts across timeouts, restarts, duplicate
  requests, different body/actor using the same key and concurrent requests.
- Run real Chat history/send/read-only/privacy tests and real broker recovery scenarios. Distinguish
  unit/fixture/schema passes from integrated passes; never describe synthetic timelines as complete
  producer history or simulated message delivery as a real Chat result.
- Verify shared routing/trust/network prerequisites with their nominated editor, then run desktop,
  mobile, keyboard and SGT timestamp checks through the real gateway. Obtain manual acceptance.

### Sanctions iteration handoff

Admin/User sanctions are implemented against the existing draft shapes under Darryl's explicit
scope approval. Admin tracks case permission/reason/operation/outcome; User owns all account effects,
current actor checks, protections, durable result/inbox/outbox and reason/audit reactivation.
Shared sanctions topics/ACLs are prepared by this nominated task, pending affected-owner activation
review. See [sanctions integration](SANCTIONS_INTEGRATION.md). Historical non-reporting targets,
Chat projection, Admin lifecycle relay, immediate cross-service revocation and resolution remain
separate dependencies. Wire schemas are unchanged; this is not approval on behalf of other owners.

### Resolution iteration handoff

Admin resolution now performs a new authenticated Chat timeline read before locking, validates
COMPLETE coverage/no blocking gaps and 60-second coverage/checkpoint freshness, and checks that
Chat covers the currently committed Admin source sequence. Under the shared case lock it
rechecks reviewer, revision/state and confirmed actions. No-action closure is allowed; each
rejected action requires its own explanation through the Admin-owned request extension approved
by Darryl. Chat wire shapes and other services are unchanged.

One transaction commits an immutable decision, case/revision, audit, original idempotency receipt
and CaseResolved outbox record. Admin's callback becomes read-only and participant status exposes
no private decision text. Admin backend/HTTP/PostgreSQL tests cover success/retry, rollback,
stale/concurrent changes, blocked evidence/actions, post-close reports/actions and callback privacy.
Successful closure tests use explicitly test-only Chat evidence. Packaged GUI verification checks
the actual unavailable-Chat path; real Chat send-vs-resolution enforcement, producer checkpoint
integration and lifecycle relay remain owner dependencies. Do not declare those integrated.

Verification: full Admin backend run passed 76 tests; the final resolution HTTP/workflow run
passed 38 tests (including the newly added HTTP tests). Admin frontend passed 61 tests, followed
by six focused passes after repairing mobile form sizing; build/lint and contract validation
passed. The packaged disposable GUI was checked at desktop and 390px mobile width, including
confirmation/cancel, visible keyboard focus, unavailable Chat and same-request recovery after
reload. SQL confirmed UNDER_REVIEW with zero decisions after the live unavailable-evidence
attempt. Successful closure remains automated with test-only evidence, not real Chat acceptance.
At that disposable-stack check, user desktop/mobile/keyboard acceptance remained pending and no
commits or shared rollout had been made. See the regular-stack integration handoff below.

### Recorded sanctions verification

Sanctions verification now covers real packaged Admin/User, private PostgreSQL and authenticated
Kafka: applied/NO_CHANGE/rejected outcomes, stable retries, self-ban rejection, reason/audit
reactivation and original-result replay without re-banning, plus restart persistence and User
outage. The default consumer-outage phase passed before revealing a User validation/error-dispatch
issue; after that issue was fixed, the clean focused rerun explicitly skipped that unchanged
phase. All four captured real sanctions messages validate against the unchanged draft schemas.
Real-database concurrency/rollback tests and User's final-admin guard pass. A reproduced profile
save race is fixed inside User with changed-field updates. Credit outcomes remain test-only;
no real Credit financial acceptance is claimed. GUI behavior tests/build/lint pass, but visual
desktop/mobile/keyboard acceptance remains pending because browser control is disabled. Existing
shared services were not activated; affected-owner review still gates shared rollout.

### Cross-service reporting navigation handoff — 4 November 2026

Darryl approved the bounded Order frontend/User return-path work and Admin-owned
`GET /api/admin/orders/{orderId}/report-context`. Order supplies navigation/context only; Admin
checks current User eligibility and either returns the actor's own statement grant/safe status or
asks Chat for reporting eligibility. Unrelated actors receive no case pointer. An unavailable or
incomplete dependency is 503, never an empty/no-report result. POST still verifies eligibility
and closed-case rules independently. Chat contracts, Order backend and other databases are unchanged.

The regular `foc-team-12` stack is active at `http://localhost:8088` after Darryl confirmed the
shared runtime review was complete. Admin uses persistent `foc-team-12_admin-db-data`, accessible
locally at `127.0.0.1:5545` with the ignored `.env` credentials. The disposable project's database
on 5544 is separate. No normal database was seeded/reset and no synthetic evidence is used live.
Existing User signing keys/passwords and other service database credentials were preserved.
Admin has its own signing key and User public-key trust; broker initialization was rerun without
resetting/restarting the broker or its data. New Order UI/API affected-owner review is still
required before merge; the earlier runtime confirmation does not imply that review.

Verification: Admin HTTP/workflow/resolution tests passed 45 cases; Admin GUI 63, User GUI 56,
and the Order full GUI suite 84 passed. The subsequent Order identity/expiry repair passed all
24 focused report-panel/errand tests. Frontend builds/lints and Order typecheck passed; generated
contracts validated 31 HTTP operations. Regular packaged services start; unauthenticated queue
and report-context return 401 and internal callback routes are not exposed by the gateway (404).
The regular administrator's Switch to Admin opens the live empty queue, and Admin remains
reachable from Profile and Errands. Dashboard checked at desktop/390px; report-unavailable at
375px has no horizontal overflow. Keyboard Tab/Enter operates queue filters and reaches retry.
Signed-out report links preserve the order query through the sign-in page; successful post-login
return and eligible/existing/private report outcomes are covered by frontend/backend tests.

The signed-in account has no errands and the regular courier browse list is empty. A read-only
nonexistent-order probe showed Order's not-found state and the independent Admin unavailable/retry
state, with no reporting form or other participant data. This is a failure-path check, not a real
eligible-errand success. Real Chat eligibility, evidence coverage and resolution remain pending
Eldridge's running producer implementation. Successful report submission, existing-report return,
unrelated-user denial and case resolution through real services still need manual acceptance with
real participant errands. Historical withdrawn-errand discovery also remains Order-owned.

Manual steps and role requirements are in the Admin README. User GUI acceptance and real Chat
success paths remain pending. Darryl subsequently requested commit, push and PR creation;
merge remains outside this task's authorization.
