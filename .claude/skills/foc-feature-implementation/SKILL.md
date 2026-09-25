---
name: foc-feature-implementation
description: Implement an approved Friend on Campus feature and tests within its owning service and contract boundaries.
---

# FoC Feature Implementation

Implement only an approved FoC brief and its test plan. Work within the owning
service; cross-service APIs, events, and shared files require explicit approval.
Preserve service data ownership and do not make another service's database or
internal code a dependency.

For Supplier backend work, preserve the web/domain/service/repository layering,
DTO validation, Problem Details, and optimistic-locking semantics. Treat the
OpenAPI document and README as contract evidence. Add a new Flyway migration for
shared schema/data changes; never alter an applied migration. Regenerate frontend
OpenAPI types only after an actual running-contract change.

For interactive work, coordinate with `/foc-ui-iteration`; use the existing
typed client and server-state conventions rather than duplicating contracts or
business rules in the UI. Add the approved automated tests and return changed
behavior evidence to `/foc-quality-review` and `/foc-verify-feature`.

Do not commit, push, merge, deploy, alter CI, or broaden scope unless separately
authorized.
