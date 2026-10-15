---
name: foc-verify-feature
description: Run applicable FoC verification checks and report evidence and limitations.
---

# FoC Verify Feature

Follow the [root reading path](../../../AGENTS.md). Use the approved test plan, owning service's
documented commands and relevant CI jobs. Reuse current results for unchanged code.

Run completion checks for affected code/API/migrations or frontend work. Use Compose build/start
and health smoke checks for runtime/integration changes when required dependencies/configuration
exist. Verify affected generated contracts against the running service.

Report build, tests, static checks, packaging and smoke results as applicable. Missing scaffolds,
dependencies, skipped checks and unverified cross-service flows are limitations, never passes.
Return failures for repair and rerun affected checks; do not suppress failures.
