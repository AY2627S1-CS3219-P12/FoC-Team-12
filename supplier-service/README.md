# Supplier Service

Spring Boot service responsible for campus supplier and location data in Friend on Campus.

This service provides a runnable Spring Boot application connected to its own PostgreSQL
database, Flyway-managed baseline data, and read-only Supplier APIs. Mutation APIs and
authentication will be added in later tasks.

## Prerequisites

- Java 17
- Docker Desktop, for running the containerized service

Maven does not need to be installed globally because the project includes the Maven Wrapper.

## Run the tests

From the `supplier-service` directory:

```sh
./mvnw test
```

## Run the application

Start PostgreSQL from the repository root:

```sh
docker compose up -d supplier-db
```

Then run Spring Boot from the `supplier-service` directory with the database connection
values from your local `.env` file:

```sh
DB_HOST=localhost \
DB_PORT=5433 \
DB_NAME=supplier_db \
DB_USER=supplier_user \
DB_PASSWORD=change-me \
./mvnw spring-boot:run
```

Replace `change-me` if you changed `SUPPLIER_DB_PASSWORD` in `.env`.

The service listens on port `8080` by default. Verify it in another terminal:

```sh
curl http://localhost:8080/actuator/health
```

The response will report an `UP` status, for example:

```json
{"groups":["liveness","readiness"],"status":"UP"}
```

## Read suppliers

List active suppliers using the default first page, 20 records per page, and ascending name
order:

```sh
curl http://localhost:8080/api/suppliers
```

Search, filter, sort, and paginate the active suppliers:

```sh
curl 'http://localhost:8080/api/suppliers?search=central&type=Food&building=Central%20Library&page=0&size=20&sort=name,asc'
```

The list endpoint supports these optional query parameters:

| Parameter | Behavior |
| --- | --- |
| `search` | Case-insensitive partial match across name, building, and location description. |
| `type` | Case-insensitive exact match. |
| `building` | Case-insensitive exact match. |
| `page` | Zero-based page number; defaults to `0` and cannot be negative. |
| `size` | Records per page; defaults to `20` and must be from `1` to `100`. |
| `sort` | `field,asc` or `field,desc`; defaults to `name,asc`. |

Allowed sort fields are `name`, `type`, `building`, `openingTime`, `closingTime`,
`createdAt`, and `updatedAt`. String sorting is case-insensitive and nullable values sort
last. Filters combine with each other, so a record must satisfy all supplied filters. Blank
search and filter values are ignored. Unsupported sort values and invalid page or size values
return `400 Bad Request` using the Problem Details JSON format.

List responses include the records and pagination metadata:

```json
{
  "items": [],
  "page": 0,
  "size": 20,
  "totalItems": 21,
  "totalPages": 2
}
```

Requesting a page beyond the final page succeeds with `200 OK` and an empty `items` array.

API paths use exact matching and do not include a trailing slash. Use
`/api/suppliers`, not `/api/suppliers/`. The same convention applies to future
Supplier endpoints unless their documentation says otherwise.

Retrieve one supplier by UUID:

```sh
curl http://localhost:8080/api/suppliers/ca9bd61f-93da-4500-9e9d-48de1bea52fa
```

Direct ID lookup can resolve both `ACTIVE` and `INACTIVE` suppliers for historical
references. Unknown IDs return `404 Not Found`, and malformed UUIDs return `400 Bad Request`
using the Problem Details JSON format.

## Run with Docker Compose

From the repository root, create a local environment file before the first run:

```sh
cp .env.example .env
```

The example credentials are for local development only. Change the password in `.env` if
needed, and never commit that file.

Build the Supplier Service image:

```sh
docker compose build supplier-service
```

Start the service in the background:

```sh
docker compose up -d supplier-service
```

Check that the container is running and the application is healthy:

```sh
docker compose ps
curl http://localhost:8080/actuator/health
```

The database is stored in the `supplier-db-data` named volume. Spring Boot connects to it
inside the Compose network at `supplier-db:5432`.

## Inspect PostgreSQL

Run a query through the PostgreSQL container:

```sh
docker compose exec supplier-db psql -U supplier_user -d supplier_db \
  -c 'SELECT current_database(), current_user;'
```

Flyway applies the versioned SQL files in `src/main/resources/db/migration` when the
application starts. The current migrations create the `suppliers` table and load the 21
baseline supplier records. The seed migration is derived from
`data/csv/supplier-seed-data-cleaned.csv`; the original template CSV remains unchanged for
reference. All baseline records start with `ACTIVE` status and version `0`.

Inspect the seeded records with:

```sh
docker compose exec supplier-db psql -U supplier_user -d supplier_db \
  -c 'SELECT id, name, type, building, status FROM suppliers ORDER BY name;'
```

Once a migration has been applied to a shared database, do not edit it. Add a new migration
such as `V3__describe_the_change.sql` instead.

For DBeaver, create a PostgreSQL connection with:

```text
Host: localhost
Port: 5433
Database: supplier_db
Username: supplier_user
Password: value from .env
SSL: disabled
```

Port `5433` is bound only to `127.0.0.1`, so the database is available to local tools but
is not exposed to other machines on the network.

View application and database startup logs with:

```sh
docker compose logs supplier-service supplier-db
```

Confirm that the application runs as a non-root user:

```sh
docker compose exec supplier-service id
```

Stop and remove the container and Compose network:

```sh
docker compose down
```

This preserves the database volume. Running `docker compose down -v` also deletes the local
database data and should only be used when an intentional reset is required.
