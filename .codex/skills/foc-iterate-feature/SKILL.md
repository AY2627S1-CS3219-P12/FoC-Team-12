---
name: foc-iterate-feature
description: Orchestrate one approved Friend on Campus feature through analysis, implementation, verification, and manual acceptance with service-specific rules.
---

# FoC Iterate Feature

Use this explicit workflow for one bounded, user-visible Friend on Campus outcome.
It is a thin project-specific orchestrator: it calls the installed specialist
skills rather than duplicating their work.

## Invocation

```text
$foc-iterate-feature <service>-<iteration-id>: <one observable outcome>
```

Name the owning service in the iteration ID. Split independently valuable
outcomes into separate iterations. Do not begin a cross-service change unless
the user has explicitly approved its contract and ownership boundaries.

## Workflow

1. Read the applicable root and service `AGENTS.md`, then apply
   `$feature-analysis`. Its brief must identify the owning service, observable
   outcome, contract/data effects, UI impact, dependencies, exclusions, and
   unresolved cross-service decisions. Stop for explicit approval before editing
   product files.
2. Apply `$test-design` after approval. Select the owning service's existing test
   conventions and distinguish automated checks from manual acceptance.
3. Apply `$feature-implementation` for only the approved behavior and tests.
4. When the change is interactive, apply `$ui-iteration`. For Supplier UI work,
   follow `supplier-service/frontend/AGENTS.md`: inspect the relevant Figma
   nodes, use the typed client and TanStack Query, reuse tokens/components, and
   produce responsive and accessible acceptance checks. Otherwise record why this
   stage is not applicable.
5. Apply `$quality-review`. Return confirmed high-risk issues to the responsible
   implementation or UI stage, then review the repair.
6. Apply `$verify-feature` with the checks selected below. Return failures to the
   responsible stage and rerun affected checks after repair.
7. Present required manual checks and stop for explicit user acceptance. A
   reported failure returns to the relevant implementation stage. After
   acceptance, summarize behavior, checks, manual result, limitations, and the
   next independently valuable iteration.

## Supplier-specific routing

For backend changes, inspect the Supplier OpenAPI contract, README behavior, and
affected DTO, controller, service, repository, and migration tests. Preserve
Problem Details and optimistic-locking behavior. Add a new Flyway migration for
shared schema/data changes; never edit an already-applied migration.

For an OpenAPI contract change, start the Supplier service and regenerate
`frontend/src/api/schema.d.ts` with `npm run api:generate`. Review the generated
diff and include it with the contract change. If the required running service or
environment is unavailable, report this as a verification limitation.

## Verification selection

- Backend, API, or migration change: run `./mvnw test` (`.\\mvnw.cmd test` in
  PowerShell).
- Frontend change: from `supplier-service/frontend`, run `npm run lint`,
  `npm run typecheck`, `npm test`, and `npm run build`.
- Packaging, runtime configuration, migration integration, or deployment-facing
  change: when Docker and local configuration are available, run the relevant
  Docker Compose build/start and `GET /actuator/health` smoke check.

Never describe an unavailable command, Docker dependency, or no-source suite as
passing. Do not create workflow logs, commits, pushes, merges, deployments, or
unrelated automation unless separately requested.
