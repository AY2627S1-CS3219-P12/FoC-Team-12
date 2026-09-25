---
name: foc-commit
description: Create safe, logical Friend on Campus commits using the repository's service boundaries, contract rules, and Conventional Commit messages.
---

# FoC Commit

Use this explicit workflow to commit ready Friend on Campus changes. Drive git
directly with these repository-specific decisions; this skill does not push,
amend, rebase, merge, reset, deploy, or bypass hooks.

## Workflow

1. Read the applicable root and service `AGENTS.md`. Inspect status, staged and
   unstaged diffs, untracked files, ignore rules, and recent history before
   staging. Treat every pre-existing change as potentially user-authored.
2. Identify logical groups by user-visible behavior and service ownership, then
   stage each with explicit paths or hunks. Ask for direction only when safe
   grouping has a material ambiguity.
3. For a Supplier backend behavior, keep its implementation, focused tests, new
   Flyway migration, and required README/OpenAPI documentation in the same
   logical commit. Keep independent frontend/UI behavior in its own commit.
4. Include `supplier-service/frontend/src/api/schema.d.ts` only when the Supplier
   OpenAPI contract changed, the types were regenerated from the running service,
   and the generated diff was reviewed. Never hand-edit it.
5. Do not stage `.env` files, credentials, private keys, `node_modules`, coverage,
   `target`, `dist`, or unrelated teammates' files. Respect `.gitignore`; never
   force-add ignored paths.
6. Run relevant validation when current results are missing: Supplier backend uses
   `.\\mvnw.cmd test` in PowerShell (or `./mvnw test` elsewhere); Supplier
   frontend uses lint, typecheck, tests, and build. Review the complete staged
   diff before each commit.
7. Use a Conventional Commit subject with no scope unless requested, for example
   `feat: add supplier public list`. Create each commit, inspect its result and
   the remaining worktree, and report hashes, subjects, checks, and uncommitted
   files.

## Grouping boundaries

- Do not combine separate features merely because they modify the same service.
- A generated OpenAPI-type update belongs with its API contract change, not an
  unrelated frontend feature.
- Documentation belongs with the behavior it documents when it changes the
  observable contract; otherwise commit it separately.
