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

For Order work, identify the affected lifecycle transition, actor-to-order authorization rule,
supplier snapshot/read dependency, expiry/concurrency interaction, duplicate-request outcome, and
whether Credit or a consumer-owned event is involved. A Credit integration brief must name the
joint contract owner and stop until its operation/event, idempotency, failure, and reconciliation
semantics are approved.

For Credit work, identify the balance/reservation/ledger invariant, allowed caller, idempotency
identity, concurrency behavior, and User or Order source fact. An activation or lifecycle
integration brief must stop until its producer-owned contract specifies duplicate, failure, retry,
and reconciliation behavior. Do not infer a balance adjustment from an Order state.

Present the brief and wait for explicit user approval before editing product
files, tests, shared configuration, or workflow artifacts.
