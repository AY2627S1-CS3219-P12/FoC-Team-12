# User Service

Spring Boot service scaffold for Friend on Campus user accounts. It uses Java 17,
PostgreSQL, Flyway, Actuator, and OpenAPI. User product APIs have not been implemented yet.

Owned by Darryl. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities.

## Prerequisites

- Java 17
- Docker Desktop, for PostgreSQL and containerized runs

Maven does not need to be installed globally because this service includes the Maven Wrapper.

## Run tests

From the `user-service` directory:

```powershell
.\mvnw.cmd test
```

On macOS or Linux:

```sh
./mvnw test
```

## Run locally

From the repository root, create a local environment file before the first run:

```powershell
Copy-Item .env.example .env
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

From the repository root:

```powershell
Copy-Item .env.example .env
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$env:JWT_PRIVATE_KEY = [Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey())
docker compose build user-service
docker compose run --rm --service-ports -e JWT_PRIVATE_KEY=$env:JWT_PRIVATE_KEY user-service
```

The current shared Compose file does not yet pass `JWT_PRIVATE_KEY` to `user-service`, so use the
`docker compose run -e` command above for this login iteration. The process stays attached; verify
health from a second terminal with `Invoke-RestMethod http://localhost:8081/actuator/health`.

The User database is independent of the Supplier database. It is stored in the
`user-db-data` Docker volume and is available to local PostgreSQL tools at
`localhost:5434`.

## OpenAPI and Swagger UI

With the service running, the future User API contract is available at:

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
15–64-character password. New accounts are `ACTIVE` with the `USER` role.

## Login and JWT verification

`POST /api/users/login` accepts an email and password. It returns a `Bearer` access token valid for
15 minutes, its ISO-8601 expiry, stable `userId`, `username`, and `role`. Unknown emails, incorrect
passwords, and non-active accounts all receive the same `401 Unauthorized` response.

Tokens are signed with RS256 and contain these claims:

| Claim | Value |
| --- | --- |
| `sub` | Stable User UUID |
| `username` | User's display username |
| `role` | `USER` or `ADMIN` |
| `iss` | `friend-on-campus-user-service` |
| `aud` | `friend-on-campus-api` |
| `iat`, `exp` | Issue and 15-minute expiry timestamps |

The public key set is published at `GET /.well-known/jwks.json`. Jun Hui and other service owners
must verify the `RS256` signature using the key selected by `kid`, and require the issuer, audience,
and expiry claims above. Consumers must use this endpoint rather than User Service database access;
they should cache keys and refresh them when an unfamiliar `kid` is received.

`GET /api/users/me` is a temporary authenticated JWT-validation endpoint. Send the access token as
`Authorization: Bearer <token>`. It returns only the token identity and will be replaced by the real
profile endpoint in a later User Service iteration.

With the service running, this PowerShell sequence registers an account, logs in, and exercises the
temporary protected endpoint:

```powershell
$registration = @{ email = "alice@u.nus.edu"; username = "Alice"; password = "password-with-at-least-15-chars" } | ConvertTo-Json
Invoke-RestMethod -Method Post http://localhost:8081/api/users/registrations -ContentType "application/json" -Body $registration
$login = @{ email = "alice@u.nus.edu"; password = "password-with-at-least-15-chars" } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post http://localhost:8081/api/users/login -ContentType "application/json" -Body $login
Invoke-RestMethod http://localhost:8081/.well-known/jwks.json
Invoke-RestMethod http://localhost:8081/api/users/me -Headers @{ Authorization = "Bearer $($session.accessToken)" }
```

## Password reset

`POST /api/users/password-reset-requests` accepts an email address and always returns `202 Accepted`,
whether or not that address has an account. For an active account it invalidates any previous reset
code, sends a new six-digit code, and keeps only a verifier in the database. Codes expire after 10
minutes, allow five attempts, and cannot be reused after a successful reset. Banned accounts do not
receive a reset code and remain banned.

`POST /api/users/password-reset-confirmations` accepts `email`, six-digit `code`, and a replacement
password (15–64 characters). A valid code changes the password and returns `204 No Content`; invalid,
expired, replayed, and exhausted codes return the same `400` Problem Detail response.

To send real email, configure Twilio SendGrid through environment variables before starting the
service. Do not put these values in source control:

```powershell
$env:MAIL_PROVIDER = "sendgrid"
$env:SENDGRID_API_KEY = "your-sendgrid-api-key"
$env:SENDGRID_FROM_EMAIL = "noreply@example.com"
```

Without `MAIL_PROVIDER=sendgrid`, the local mailer is deliberately disabled and never logs or exposes
reset codes. Tests use a fake mailer instead.

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
