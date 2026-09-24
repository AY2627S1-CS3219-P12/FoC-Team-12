# Supplier Service instructions

These instructions apply to backend work in `supplier-service/`; the frontend has
additional instructions in `frontend/AGENTS.md`.

## Architecture and contracts

- Preserve the current layering: web DTO/controller concerns in `web/`, domain
  state in `domain/`, use cases in `service/`, and persistence/query logic in
  `repository/`.
- Treat the running OpenAPI document at `/v3/api-docs`, controller/DTO validation,
  and the Supplier README as one contract. Update the relevant contract evidence
  when externally observable API behavior changes.
- Retain server-side validation, Problem Details error behavior, and optimistic
  locking semantics. UI authorization or hidden controls never substitute for
  backend authorization.

## Data changes

- Do not alter a Flyway migration that may have been applied or shared. Create the
  next versioned migration for schema or baseline-data changes and test the
  affected persistence behavior.
- Keep Supplier data ownership inside this service unless an explicitly approved
  cross-service contract requires otherwise.

## Verification

- Run `./mvnw test` on Unix-like shells or `.\\mvnw.cmd test` in PowerShell for
  backend code, tests, schema migrations, or API-contract changes.
- For packaging, runtime configuration, or migration integration changes, run the
  applicable Docker Compose build/start and health check when Docker and required
  local environment values are available. Report unavailable dependencies as
  limitations, never as passing checks.
