---
name: foc-quality-review
description: Review changed Friend on Campus code for concrete correctness, service boundaries, contract, and maintainability issues.
---

# FoC Quality Review

Review changed files and nearby architecture against root/service guidance and
the approved feature brief. Report concrete findings by severity, path/location,
impact, and practical resolution; do not invent project standards.

Check service ownership and contract boundaries first. For Supplier backend
changes, check layering, validation/error behavior, optimistic locking, API/README
consistency, and migration immutability. For Supplier frontend changes, check
typed-client/TanStack Query use, token/component reuse, responsiveness,
accessibility, and absence of client-side authorization claims.

Return confirmed high-risk issues to `/foc-feature-implementation` or
`/foc-ui-iteration`, then review the repair. A clean review is evidence-based,
not a guarantee. Review does not authorize scope expansion or commits.
