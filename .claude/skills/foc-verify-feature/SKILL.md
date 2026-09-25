---
name: foc-verify-feature
description: Run and report the applicable Friend on Campus build, test, lint, and smoke checks for a bounded feature.
---

# FoC Verify Feature

Read root/service guidance and `.github/workflows/ci.yml`, then run only checks
that apply to the approved change. Report build, automated-test, static-analysis,
packaging, and smoke outcomes separately. A skipped or unavailable check is a
limitation, never a pass.

For Supplier backend code, API, or migration changes, run the Maven Wrapper
verification lifecycle: `./mvnw --batch-mode --no-transfer-progress verify`
(`.\\mvnw.cmd --batch-mode --no-transfer-progress verify` in PowerShell).
For Supplier frontend changes, run `npm ci`, `npm run lint`, `npm run typecheck`,
`npm test`, and `npm run build` from `supplier-service/frontend`. Use Docker
Compose build/start and `/actuator/health` only for packaging, runtime
configuration, or integration changes when Docker and required environment values
are available.

For an OpenAPI contract change, verify regenerated frontend types against the
running service before reporting success. Return failures to
`/foc-feature-implementation` or `/foc-ui-iteration`, rerun affected checks
after repair, and do not suppress failures or commit/deploy without separate
authorization.
