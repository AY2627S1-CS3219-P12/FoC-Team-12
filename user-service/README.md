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
.\mvnw.cmd spring-boot:run
```

The service listens on port `8081`. Verify its health in another terminal:

```powershell
Invoke-RestMethod http://localhost:8081/actuator/health
```

## Run with Docker Compose

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose build user-service
docker compose up -d user-service
docker compose ps
Invoke-RestMethod http://localhost:8081/actuator/health
```

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
