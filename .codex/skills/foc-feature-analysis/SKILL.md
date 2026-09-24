---
name: foc-feature-analysis
description: Define one Friend on Campus feature into an approval-ready brief with explicit service ownership and contract boundaries.
---

# FoC Feature Analysis

Use before implementing one bounded FoC feature. Read root `AGENTS.md`, the
owning service guidance, relevant source/tests, backlog material, and existing
contracts before proposing behavior.

## Required brief

Identify the actor outcome, owning service, observable acceptance scenarios,
preconditions, data and API/event effects, UI impact, dependencies, exclusions,
and unresolved decisions. A feature crossing service ownership must name the
producing contract owner and stop for explicit approval; do not infer a shared
field, event, or database access.

For Supplier work, compare externally observable changes against the README and
OpenAPI contract. Identify Flyway, optimistic-locking, Problem Details, and
frontend generated-type effects where applicable. For scaffold services, state
the missing build/test/contract conventions rather than inventing them.

Present the brief and wait for explicit user approval before editing product
files, tests, shared configuration, or workflow artifacts.
