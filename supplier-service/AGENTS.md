# Supplier Service agent boundary

Owner: Jun Hui.

## In scope

- Supplier/location schema and data, CRUD/query APIs, ACTIVE/INACTIVE behavior, Supplier UI,
  authentication/RBAC integration, migrations, tests, and API contract.
- Logging, event-broker reliability/retries/failure recording, and observability.

## Out of scope

Do not implement user identity, Order lifecycle, Credit rules, Notifications, or Chat. Use
published identities/contracts and never access another service's database.

## Existing checks

- Backend: `./mvnw test`
- Frontend: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

Frontend work must also follow `frontend/AGENTS.md`. Do not invent unresolved authentication,
event-broker, logging-retention, or cloud behavior.
