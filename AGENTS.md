# Friend on Campus repository guidance

## Service boundaries

- Start every feature iteration by naming one owning service. Keep implementation,
  tests, documentation, and generated artifacts in that service unless the user has
  explicitly approved a cross-service contract change.
- `supplier-service/` is the only service with an implemented application and
  established verification workflow. `user-service/`, `order-service/`, and
  `credit-service/` are scaffolds; establish their build, test, contract, and
  runtime conventions before treating them as supported iteration targets.
- Use the repository-local `$foc-iterate-feature` skill for planned, user-visible
  FoC changes. It orchestrates the installed analysis, test-design,
  implementation, UI, review, and verification skills with project rules.

## Version-control policy

- Use Conventional Commit subjects for new commits: `type: concise imperative
  description`. Use lowercase types such as `feat`, `fix`, `test`, `docs`, and
  `chore`; do not add a scope unless the requester asks for one.
- Use `$foc-commit` to prepare a logical FoC commit. It supplements the installed
  `$commit` workflow with service boundaries, generated-contract, migration, and
  validation rules. Never add local secrets, generated build output, dependencies,
  or unrelated work.
