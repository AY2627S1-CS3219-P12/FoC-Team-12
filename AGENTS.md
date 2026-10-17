# Repository agent rules

Before editing, identify the owning service from [TASK_SPLIT.md](TASK_SPLIT.md) and read its
`AGENTS.md`, including any nested instructions for the affected folder. Ask if ownership is
unclear. For an explicitly assigned shared task, identify its editor and affected service owners.

## Boundaries

- Work within the assigned service/N2H area and approved shared-file scope. Never change another
  service's code, API, frontend, or database just to make your task pass. The narrow cross-service
  frontend exception in [design.md](design.md) applies only to material shared-shell,
  accessibility or end-to-end usability fixes and still requires affected-owner review.
- Each service exclusively reads/writes its own database. Integrate through producer-owned
  APIs/events; every backend enforces authorization locally.
- Before introducing or changing a cross-service contract, obtain explicit approval of ownership
  and behavior. Document caller/producer/consumer, inputs/outcomes, operation identity, duplicate
  handling, failure/retry/reconciliation responsibility, and observability where applicable.
- Shared gateway, Compose, environment examples, broker configuration and CI changes have one
  nominated editor and require review from all affected service owners.
- Use approved backlog/wireframes for product rules; record missing or conflicting rules for
  confirmation. Update affected tests and service documentation when behavior changes.

## Reading and workflow

Read applicable guidance once per task; revisit it when scope or documents change. Inspect only
relevant README/contract sections, source and tests. Read a service checklist when choosing or
scoping an iteration; it is a roadmap, not a requirement to implement all steps.

Use `$foc-iterate-feature <service>-<iteration>: <outcome>` for the staged feature workflow, and
`$foc-commit` when commits are requested. Skills define the process; service instructions define
the invariants; READMEs hold behavior/contracts and verification commands. Personal, ignored
checklists are not shared acceptance sources.

For any frontend planning, implementation or review, read and maintain the shared
[UI/UX standard](design.md).
