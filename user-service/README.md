# User Service

The D2 Friend on Campus User Service uses Spring Boot, Java 17, PostgreSQL, Flyway,
Actuator, and OpenAPI. It provides NUS-email registration and verification, login,
password reset, a view-only profile, first-administrator bootstrap, and protected
administrator role/lifecycle APIs. The browser UI does not yet include an Admin Dashboard.

Owned by Darryl. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities.

## Prerequisites

- Java 17
- Docker Desktop, for PostgreSQL and containerized runs

Maven does not need to be installed globally because this service includes the Maven Wrapper.

## Run tests

From the `user-service` directory, run the complete backend verification suite:

```powershell
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```

On macOS or Linux:

```sh
./mvnw --batch-mode --no-transfer-progress verify
```

## Run locally

From the repository root, create a local environment file before the first run if one
does not already exist. Fill in `USER_DB_*` and the User Service values described below;
`.env` is local-only and must never be committed:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Start the dedicated User PostgreSQL database:

```powershell
docker compose up -d user-db
```

Then, from `user-service`, start the application:

```powershell
$env:DB_HOST = "localhost"
$env:DB_PORT = "5434"
$env:DB_NAME = "user_db"
$env:DB_USER = "user_user"
$env:DB_PASSWORD = "change-me"
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$env:JWT_PRIVATE_KEY = [Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey())
.\mvnw.cmd spring-boot:run
```

The two JWT commands generate an ephemeral development key. For a persistent environment, generate
the key once, store the Base64-encoded PKCS#8 private key in the deployment secret store, and set it
as `JWT_PRIVATE_KEY`. Never commit or share this value.

The service listens on port `8081`. Verify its health in another terminal:

```powershell
Invoke-RestMethod http://localhost:8081/actuator/health
```

## Run with Docker Compose

From the repository root, put `USER_DB_NAME`, `USER_DB_USER`, `USER_DB_PASSWORD`, and a
Base64-encoded PKCS#8 `JWT_PRIVATE_KEY` in the local `.env`. For live verification and
reset email, also set `MAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, and
`SENDGRID_FROM_EMAIL` there. Use a verified SendGrid sender and a real NUS inbox.
Generate a development-only private key in PowerShell with:

```powershell
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
[Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey())
```

Copy the output into `JWT_PRIVATE_KEY` in `.env` without quotes. Keep a stable key across
restarts in any persistent deployment; changing it invalidates outstanding JWTs. Start
only the User components (the Supplier database is untouched):

```powershell
docker compose up --build user-service user-frontend
```

Open <http://localhost:5174>. The frontend container runs `npm run dev` and proxies
`/api` to the `user-service` container. The API is at `http://localhost:8081`; these
are separate processes. From another terminal, check `docker compose ps` and
`Invoke-RestMethod http://localhost:8081/actuator/health`. For local frontend-only
development, run `npm run dev` from `user-service/frontend` while the API is running.

The User database is independent of the Supplier database. It is stored in the
`user-db-data` Docker volume and is available to local PostgreSQL tools at
`localhost:5434`.

## OpenAPI and Swagger UI

With the service running, the live User API contract is available at:

```text
Swagger UI: http://localhost:8081/swagger-ui/index.html
JSON:       http://localhost:8081/v3/api-docs
YAML:       http://localhost:8081/v3/api-docs.yaml
```

Future schema changes must be introduced through forward-only Flyway migrations in
`src/main/resources/db/migration`.

## Register

`POST /api/users/registrations` accepts an email from `@u.nus.edu`, `@u.duke.nus.edu`, or
`@u.yale-nus.edu.sg`, a case-insensitively unique username of at most 20 characters, and a
15–64-character password. New accounts are `UNVERIFIED` with the `USER` role and cannot log in
until their NUS email is verified.

## Email verification

After registration, the service sends a six-digit verification code through Twilio SendGrid. Codes
are stored only as verifiers, expire after 10 minutes, allow five attempts, and become unusable after
successful verification. Confirm the code with `POST /api/users/email-verifications`, supplying
`email` and `code`; success returns `204 No Content` and activates the account.

Use `POST /api/users/email-verification-resends` with `email` to resend a code. Resends are limited
to one email per 90 seconds and invalidate all earlier verification attempts. A request before the
cooldown expires returns `429 Too Many Requests` with a `Retry-After` header. Per the approved
product rule, resend returns specific responses: `404` for an unknown email, `409` when already
verified, and `403` for a banned account.

Email verification uses the same `MAIL_PROVIDER`, `SENDGRID_API_KEY`, and `SENDGRID_FROM_EMAIL`
environment variables documented under Password reset. Never commit these credentials or a code.

## First administrator bootstrap

The first administrator is deployment-only: there is no HTTP endpoint and no default credential.
For the first deployment only, inject all of these secrets together:

```text
ADMIN_BOOTSTRAP_EMAIL=first.admin@u.nus.edu
ADMIN_BOOTSTRAP_USERNAME=First Admin
ADMIN_BOOTSTRAP_PASSWORD=a-password-with-at-least-15-characters
MAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=verified-sender@example.com
```

The bootstrap uses a database-locked singleton state, so concurrent instances and restarts create
or promote only one administrator. If its configured email or username belongs to an existing
`USER`, that account is promoted to `ADMIN`; existing profile values and password are unchanged.
For a new or still-unverified account, the normal verification OTP is sent and the account cannot
log in until verification succeeds. An already active account needs no new OTP.

Bootstrap is disabled when all `ADMIN_BOOTSTRAP_*` values are blank. Supplying only some of them,
invalid NUS credentials, incomplete SendGrid configuration, or a SendGrid delivery failure stops
application startup. After a successful run, remove the three bootstrap secrets from the deployment;
the persisted completion state also makes later starts no-ops. Never commit these values.

## Login and JWT verification

`POST /api/users/login` accepts an email and password. It returns a `Bearer` access token valid for
15 minutes, its ISO-8601 expiry, stable `userId`, `username`, and `role`. Unknown emails, incorrect
passwords, and banned accounts all receive the same `401 Unauthorized` response. An unverified
account receives `403` with Problem Detail code `EMAIL_VERIFICATION_REQUIRED` only after the supplied
password has matched; clients use this to direct that legitimate user to email verification.

Tokens are signed with RS256 and contain these claims:

| Claim | Value |
| --- | --- |
| `sub` | Stable User UUID |
| `username` | User's display username |
| `role` | `USER` or `ADMIN` |
| `iss` | `friend-on-campus-user-service` |
| `aud` | `friend-on-campus-api` |
| `iat`, `exp` | Issue and 15-minute expiry timestamps |

The public key set is published at `GET /.well-known/jwks.json`. Every backend service that accepts
these tokens must verify the `RS256` signature using the key selected by `kid`, and require the
issuer, audience, and expiry claims above. Consumers must use this endpoint rather than User Service
database access; they should cache keys and refresh them when an unfamiliar `kid` is received.

`GET /api/users/me` returns the authenticated user's persisted profile. Send the access token as
`Authorization: Bearer <token>`. Its response contains the stable user ID, NUS email, username,
role, account status, and account creation timestamp. It is view-only: the profile API does not
permit changing email, username, password, role, or status.

With the service running and SendGrid configured, this PowerShell sequence registers an
account, verifies the code from its NUS inbox, then logs in and reads the profile.
Use a new email/username for each run; logging in before verification must return the
generic `401` response:

```powershell
$registration = @{ email = "alice@u.nus.edu"; username = "Alice"; password = "password-with-at-least-15-chars" } | ConvertTo-Json
Invoke-RestMethod -Method Post http://localhost:8081/api/users/registrations -ContentType "application/json" -Body $registration
$login = @{ email = "alice@u.nus.edu"; password = "password-with-at-least-15-chars" } | ConvertTo-Json
$verification = @{ email = "alice@u.nus.edu"; code = (Read-Host "Six-digit code from the NUS inbox") } | ConvertTo-Json
Invoke-RestMethod -Method Post http://localhost:8081/api/users/email-verifications -ContentType "application/json" -Body $verification
$session = Invoke-RestMethod -Method Post http://localhost:8081/api/users/login -ContentType "application/json" -Body $login
Invoke-RestMethod http://localhost:8081/.well-known/jwks.json
Invoke-RestMethod http://localhost:8081/api/users/me -Headers @{ Authorization = "Bearer $($session.accessToken)" }
```

## Administrator role and lifecycle API

This iteration exposes protected API controls only; it does not include an Admin Dashboard. Every
endpoint below requires an `Authorization: Bearer <access-token>` for an account that is currently
both `ADMIN` and `ACTIVE` in the User database. A stale token for a demoted or banned account is
rejected even if its JWT still contains the `ADMIN` role claim.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/users/admin/accounts?query=&page=0&size=20` | Paged account summaries; `query` searches email or username. |
| `PATCH /api/users/admin/accounts/{id}/role` | Body `{"role":"ADMIN"}` promotes, or `{"role":"USER"}` demotes an active account. |
| `PATCH /api/users/admin/accounts/{id}/status` | Body `{"status":"BANNED"}` bans an active account, or `{"status":"ACTIVE"}` reactivates a banned account. |

There is deliberately no account-deletion API. Role changes and bans are allowed only for active
accounts; unverified accounts cannot be banned. Administrators cannot demote, ban, or delete
themselves. The service serializes role/lifecycle changes and rejects any demotion or ban that
would remove the final active administrator. Invalid transitions return `409 Conflict`; a missing
target returns `404`; non-admin callers return `403`.

## Password reset

`POST /api/users/password-reset-requests` accepts an email address and always returns `202 Accepted`,
whether or not that address has an account. For an active account it invalidates any previous reset
code, sends a new six-digit code, and keeps only a verifier in the database. Codes expire after 10
minutes, allow five attempts, and cannot be reused after a successful reset. Banned accounts do not
receive a reset code and remain banned.

`POST /api/users/password-reset-verifications` accepts `email` and the six-digit `code`. It validates
the code without consuming it and returns `204 No Content`, allowing a client to show the password-entry
screen only after successful validation. The existing `POST /api/users/password-reset-confirmations`
then accepts `email`, `code`, and a replacement password (15–64 characters); it revalidates and consumes
the code when changing the password. Invalid, expired, replayed, and exhausted codes return the same
`400` Problem Detail response from either endpoint.

To send real email, configure Twilio SendGrid through environment variables before starting the
service. Do not put these values in source control:

```powershell
$env:MAIL_PROVIDER = "sendgrid"
$env:SENDGRID_API_KEY = "your-sendgrid-api-key"
$env:SENDGRID_FROM_EMAIL = "noreply@example.com"
```

Without `MAIL_PROVIDER=sendgrid`, the local mailer is deliberately disabled and never logs or exposes
reset codes. Registration in that mode still creates an `UNVERIFIED` account, but no OTP reaches
the inbox, so a full manual registration/login demo requires working SendGrid configuration.
Tests use fake mailers instead.

## Frontend

From `user-service/frontend`:

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

The Vite frontend runs at `http://localhost:5174` and proxies `/api` to the User Service on port `8081`.
It includes registration, email-verification and resend-code screens, login, and password-reset flows.

Successful registration moves directly to six accessible OTP boxes with the registered email already set;
entering the sixth digit automatically submits the verification. The resend button displays its 90-second
cooldown and is disabled until another request is allowed.
When a user supplies the correct password for an unverified account, login likewise moves to that
verification screen; incorrect credentials and banned accounts remain a generic login failure.
Password reset similarly uses six OTP boxes; only a validated code opens the new-password screen.
The reset OTP screen keeps the user in place when requesting another code, shows a browser-side
90-second resend countdown, and offers only a successful OTP path or **Back to sign in**. After a
password update, the frontend shows a completion screen with only **Sign in**.

After login, the view-only profile shows persisted email, username, role, status, and creation time.
There is no Admin Dashboard; administrator actions can currently be exercised only through the
protected API (for example, Swagger UI with an active administrator's bearer token).

For a live browser smoke test: register a fresh NUS address at `http://localhost:5174`,
confirm that login is refused until the delivered OTP is entered, verify the email,
log in and inspect the profile, then sign out. Request a password reset, enter the
new OTP and password, and confirm that the old password fails while the new one works.
The first-admin bootstrap must be tested with a dedicated, empty User database or a
previously unused deployment; it is one-shot and should not be retriggered by deleting
the existing database volume. Role/lifecycle API checks require an already verified
administrator and at least one additional active test account. Do not delete production
data for a manual test.