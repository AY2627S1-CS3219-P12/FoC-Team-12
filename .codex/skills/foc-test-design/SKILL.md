---
name: foc-test-design
description: Design focused Friend on Campus automated and manual checks from an approved feature brief.
---

# FoC Test Design

Use the approved FoC feature brief as the source of truth. Read the owning
service guidance, existing tests, and CI workflow before proposing cases.

Cover successful behavior, boundaries, invalid states, authorization when
applicable, contract/data consistency, concurrency where the domain requires it,
and affected-flow regressions. Separate automated tests from manual acceptance.

For Supplier backend work, follow the existing JUnit/Mockito/controller test
style and include API validation, Problem Details, optimistic locking, or Flyway
effects when affected. For Supplier frontend work, use Vitest and Testing Library
for behavior that can be automated, plus responsive 375px/desktop, keyboard,
focus, and error-feedback manual checks. Do not propose database integration
tests or generated-contract checks when the approved change does not need them.

Call out unavailable environments or unimplemented service test conventions as
limitations. Do not edit tests or product files at this stage.
