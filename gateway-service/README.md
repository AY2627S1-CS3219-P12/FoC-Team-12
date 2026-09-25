# Friend on Campus API Gateway

The Gateway Service is the public API entry point for Friend on Campus. It routes requests to the
service that owns the published API contract; it does not contain domain logic, access databases,
issue tokens, or replace downstream authorization.

## Routes

| Gateway path | Downstream service | Downstream path |
| --- | --- | --- |
| `GET /` | User Service | unchanged |
| `GET /user-assets/**` | User Service | unchanged |
| `GET /suppliers` and `GET /suppliers/**` | Supplier Service | unchanged |
| `GET /admin/suppliers` and `GET /admin/suppliers/**` | Supplier Service | unchanged |
| `GET /supplier-assets/**` | Supplier Service | unchanged |
| `/api/users` and `/api/users/**` | User Service | unchanged |
| `/api/suppliers` and `/api/suppliers/**` | Supplier Service | unchanged |
| `/api/admin/suppliers` and `/api/admin/suppliers/**` | Supplier Service | unchanged |
| `GET /.well-known/jwks.json` | User Service | unchanged |
| `GET /docs/user/openapi.json` | User Service | `/v3/api-docs` |
| `GET /docs/user/openapi.yaml` | User Service | Converted from `/v3/api-docs` |
| `GET /docs/supplier/openapi.json` | Supplier Service | `/v3/api-docs` |
| `GET /docs/supplier/openapi.yaml` | Supplier Service | `/v3/api-docs.yaml` |

The UI routes are intentionally explicit: the gateway has no catch-all route. Unrecognised paths
return `404`. Order and Credit routes will be added only after those service owners publish their
ports and API paths.

## Run locally

Java 17 is required. Start User and Supplier services first, then run:

```sh
./mvnw spring-boot:run
```

Local defaults are:

```text
USER_SERVICE_URL=http://localhost:8081
SUPPLIER_SERVICE_URL=http://localhost:8080
```

Override either environment variable when the downstream service uses another address.

To run the complete Docker stack from the repository root, first configure the root `.env`,
including `JWT_PRIVATE_KEY`, and then run:

```sh
docker compose up -d --build gateway
```

Compose routes internally through `user-service:8081` and `supplier-service:8080`. Open
`http://localhost:8088` for the packaged login and service hub, then use its Supplier links. Both
SPAs run under the same browser origin and therefore share the validated
`sessionStorage["foc.user-session"]` value. Production assets remain collision-free under
`/user-assets/**` and `/supplier-assets/**`.

Use the shared `8088` origin by default for browsers, frontend clients, Postman, and cross-service
testing. Direct ports `8080` and `8081` remain available only for service-specific development and
troubleshooting.

## Documentation and health

- Aggregated Swagger UI: `http://localhost:8088/swagger-ui/index.html`
- User OpenAPI JSON: `http://localhost:8088/docs/user/openapi.json`
- User OpenAPI YAML: `http://localhost:8088/docs/user/openapi.yaml`
- Supplier OpenAPI JSON: `http://localhost:8088/docs/supplier/openapi.json`
- Supplier OpenAPI YAML: `http://localhost:8088/docs/supplier/openapi.yaml`
- Gateway health: `http://localhost:8088/actuator/health`

The Swagger UI selector switches between the User and Supplier contracts. Because the current
specifications do not declare a separate server URL, **Try it out** sends requests through the
gateway origin. Direct service Swagger remains available for debugging until UI/gateway
integration is completed.

## Authentication boundary

The User frontend saves the login response in session storage for the current `8088` browser tab.
The Supplier frontend validates that session before using it and forwards its access token as a
bearer token. It clears malformed, expired, or rejected sessions. Client-side role checks improve
navigation only and are not a security boundary.

The gateway forwards bearer tokens but does not validate them. User Service remains the token
issuer, and each backend remains responsible for validating JWTs and enforcing its own roles.
Supplier Service therefore continues to return `401` for invalid or missing tokens and `403` for
authenticated users without `ADMIN`.

## Tests

```sh
./mvnw test
```

The tests use isolated local stub servers and do not require Docker, PostgreSQL, or running domain
services.

## Changing routes

Gateway ownership is shared. For each route change, nominate one implementer and request review
from every affected service owner. The producing service owns its paths and payload contract; the
gateway must not invent or compensate for unpublished service behavior.

The shared-origin UI integration changes both service-owned bundles and must be reviewed by the
User and Supplier service owners before this experimental branch is merged.
