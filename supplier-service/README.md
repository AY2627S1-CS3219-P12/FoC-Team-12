# Supplier Service

Spring Boot service responsible for campus supplier and location data in Friend on Campus.

This service provides a runnable Spring Boot application connected to its own PostgreSQL
database, Flyway-managed baseline data, and Supplier read, create, update, status, and delete
APIs. Authentication will be added in a later task.

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

## OpenAPI and Swagger UI

OpenAPI is the machine-readable contract describing the Supplier endpoints, parameters,
request bodies, responses, and errors. Swagger UI is the interactive web page generated from
that contract. With the service running, open:

```text
http://localhost:8080/swagger-ui/index.html
```

The generated contract is also available directly:

```text
JSON: http://localhost:8080/v3/api-docs
YAML: http://localhost:8080/v3/api-docs.yaml
```

Select an operation in Swagger UI and choose **Try it out** to send a request. Swagger UI is
served by the running Supplier Service, so it uses the service's real configured PostgreSQL
database. Read requests are safe to explore, but POST, PUT, PATCH, and DELETE requests really
create, modify, or permanently delete records.

The OpenAPI contract is generated at runtime from the Spring controllers, DTO validation, and
documentation annotations; generated JSON or YAML is not committed to the repository. The
mutation endpoints and documentation are currently available without authentication for local
API-first development. Production documentation exposure and `ADMIN` authorization will be
decided when JWT security and deployment profiles are introduced.

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

## Create a supplier

Create a supplier with `POST /api/suppliers`:

```sh
curl -i http://localhost:8080/api/suppliers \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "New Campus Cafe",
    "type": "Food/Coffee",
    "building": "COM3",
    "floor": "1",
    "locationDescription": "Beside the main entrance",
    "latitude": 1.2948,
    "longitude": 103.7716,
    "openingTime": "08:00",
    "closingTime": "18:00",
    "imageUrl": "https://example.com/cafe.jpg",
    "status": "ACTIVE"
  }'
```

`name`, `type`, `building`, `latitude`, and `longitude` are required. Text is trimmed,
and blank optional text is stored as `null`. Latitude must be from `-90` to `90`, longitude
must be from `-180` to `180`, and an image URL must use HTTP or HTTPS. Opening and closing
times are independently optional, and overnight hours are allowed. Status may be `ACTIVE`
or `INACTIVE`; omitting it defaults to `ACTIVE`.

A successful request returns `201 Created`, the complete Supplier object, and a `Location`
header containing `/api/suppliers/{id}`. The server generates the UUID, version, and
timestamps. Invalid fields or malformed JSON return `400 Bad Request` using Problem Details;
field validation responses include an `errors` object.

> **Development security notice:** `POST /api/suppliers` is temporarily unauthenticated for
> local API-first testing. It must be restricted to authenticated administrators when the
> User Service JWT contract is available. Do not treat the current endpoint as production
> access control.

## Update a supplier

Replace a supplier's editable details with `PUT /api/suppliers/{id}`:

```sh
curl -i -X PUT \
  http://localhost:8080/api/suppliers/ca9bd61f-93da-4500-9e9d-48de1bea52fa \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Updated Campus Cafe",
    "type": "Food/Coffee",
    "building": "COM3",
    "floor": "2",
    "locationDescription": "Now beside the lift",
    "latitude": 1.2948,
    "longitude": 103.7716,
    "openingTime": "09:00",
    "closingTime": "20:00",
    "imageUrl": "https://example.com/updated-cafe.jpg",
    "version": 0
  }'
```

This is a full update, not a partial update. The request must describe the complete desired
editable state of the supplier rather than only the fields that changed. Every request must
include `name`, `type`, `building`, `latitude`, `longitude`, and `version`; omitting any of
these fields returns `400 Bad Request`. The optional editable fields are `floor`,
`locationDescription`, `openingTime`, `closingTime`, and `imageUrl`. If an optional field is
omitted or contains blank text, it is deliberately cleared to `null`.

Creation validation rules also apply here. The endpoint does not accept changes to `id`,
`status`, `createdAt`, or `updatedAt`; the server manages the timestamp. Both active and
inactive suppliers can be updated, but their current status remains unchanged.

Use the `version` from the latest GET response. A successful change returns `200 OK`, keeps
`createdAt`, updates `updatedAt`, and increments `version`. Sending the same details is a
successful no-op and does not increment the version or timestamp.

If another request updated the supplier first, the stale request returns `409 Conflict`:

```json
{
  "title": "Supplier update conflict",
  "status": 409,
  "detail": "Supplier has changed since the requested version",
  "supplierId": "ca9bd61f-93da-4500-9e9d-48de1bea52fa",
  "requestedVersion": 0,
  "currentVersion": 1
}
```

After a conflict, retrieve the supplier again, reconcile the latest data with the intended
changes, and retry using the new version. Unknown IDs return `404 Not Found`; malformed IDs,
invalid fields, and malformed JSON return `400 Bad Request` using Problem Details.

> **Development security notice:** `PUT /api/suppliers/{id}` is temporarily unauthenticated
> for local API-first testing. It must be restricted to authenticated administrators when
> the User Service JWT contract is available.

## Change supplier status

Activate or deactivate a supplier without resending its details using
`PATCH /api/suppliers/{id}/status`:

```sh
curl -i -X PATCH \
  http://localhost:8080/api/suppliers/ca9bd61f-93da-4500-9e9d-48de1bea52fa/status \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "INACTIVE",
    "version": 0
  }'
```

Both `status` and `version` are required. Status must be `ACTIVE` or `INACTIVE`, and version
must be nonnegative. Use the version from the latest GET response. A successful status
change returns `200 OK` with the complete Supplier object, increments `version`, and updates
`updatedAt`; all supplier details and `createdAt` remain unchanged.

An inactive supplier is excluded from `GET /api/suppliers` but remains available through
direct ID lookup. Reactivating it makes it visible in listings again. Sending the supplier's
existing status with its current version is a successful no-op and does not change the
version or timestamp. A stale version returns the same `409 Supplier update conflict`
Problem Details response documented above; retrieve the latest supplier before retrying.

> **Development security notice:** `PATCH /api/suppliers/{id}/status` is temporarily
> unauthenticated for local API-first testing. It must be restricted to authenticated
> administrators when the User Service JWT contract is available.

## Permanently delete a supplier

Permanently remove either an active or inactive supplier using its latest version:

```sh
curl -i -X DELETE \
  'http://localhost:8080/api/suppliers/ca9bd61f-93da-4500-9e9d-48de1bea52fa?version=2'
```

A successful deletion returns `204 No Content`. The record is removed from PostgreSQL and
cannot be retrieved or reactivated afterward. Prefer changing the supplier to `INACTIVE`
when it should only be hidden from normal listings; hard deletion should be reserved for
records that genuinely need to be removed permanently.

The required `version` protects against deleting changes the requester has not seen. For
example, if Admin A retrieves version `2` and Admin B then updates the supplier to version
`3`, Admin A's `?version=2` deletion returns `409 Conflict` instead of permanently deleting
Admin B's newer changes. After a conflict, retrieve the supplier again and deliberately
decide whether to delete its latest version.

Version is passed as a query parameter because it is a precondition for the deletion, not
part of the Supplier data being deleted. DELETE request bodies also have inconsistent
support across HTTP clients and proxies. A numeric `?version=` keeps the request explicit
and follows the same optimistic-locking model used by PUT and PATCH.

The version must be a nonnegative whole number. Missing or invalid versions return
`400 Bad Request`, stale versions return the existing `409 Supplier update conflict`
Problem Details response, and unknown or already-deleted suppliers return `404 Not Found`.

> **Development security notice:** `DELETE /api/suppliers/{id}` is temporarily
> unauthenticated for local API-first testing. It must be restricted to authenticated
> administrators when the User Service JWT contract is available.

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
