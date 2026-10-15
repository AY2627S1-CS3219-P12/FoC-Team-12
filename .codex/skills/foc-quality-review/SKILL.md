---
name: foc-quality-review
description: Review a FoC change for concrete correctness, boundary and contract issues.
---

# FoC Quality Review

Review the diff and relevant surrounding code against the approved brief and applicable
instructions from the [root reading path](../../../AGENTS.md). Check ownership/contracts,
service invariants, affected API/documentation consistency and selected test coverage.

Report actionable findings with severity, path/line, impact and practical resolution; do not
invent standards or expand scope. Return confirmed high-risk issues to implementation/UI, then
review the repair. State remaining limitations when no findings are confirmed.
