# Admin foundation

Owner: Darryl. Java 17 / Spring Boot 4.1.1, PostgreSQL/Flyway, React/TypeScript/Vite.
Scope approved in the foundation brief: Admin backend/database/dashboard, current User
eligibility and service-authenticated case-access callback. See
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
- Flyway creates only Admin-owned case/membership tables with unique order and participant
  constraints. There is no production seed, case-creation endpoint or mutation in foundation.
  Tests populate case fixtures; live cases arrive in the reporting iteration.
- `/admin` renders the shell. It uses the existing `foc.user-session` browser session,
  but trusts only the backend's check. It rechecks access every 30 seconds while open,
  clears protected UI on session replacement/expiry and distinguishes 401/403/503/network
  failures. Every future protected operation must still authorize on its backend.
  Visual conventions match User/Credit/Order: the green FoC bag mark, horizontal service
  navigation, account/workspace menu, shared color tokens, card shapes and mobile header.
  Workspace switching uses the existing User session-role API and rechecks Admin access
  with the returned token. A browser role selection never grants administrator access.

No Chat/Order/Credit code, broker topics, root Compose/gateway/CI or Kubernetes policies
are changed. Reports, claims, evidence adapters, conversations, actions and resolution
are later iterations. Account/supplier tools link to their existing owners.

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
Supplier links use the existing gateway on 8088. The packaged Admin shell expects the
future shared gateway to route User/account/supplier links; direct backend hosting alone
does not provide a second login system.
Set `VITE_USER_URL` before starting Vite when testing a User instance on another local port.

Configuration:

| Variable | Purpose |
| --- | --- |
| `ADMIN_DB_HOST/PORT/NAME/USER/PASSWORD` | Admin-only database; defaults localhost/5432/admin_db/admin_user, password required |
| `ADMIN_PORT` | Backend local port, default 8084 |
| `ADMIN_USER_URL` | Private User base URL, default http://localhost:8081 |
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
with retry. Check keyboard focus/skip link, mobile width and desktop layout. No case counts,
successful case workflows or cross-service deployment readiness are claimed.
