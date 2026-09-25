---
name: foc-ui-iteration
description: Implement an approved Friend on Campus interactive flow with Supplier design, accessibility, and API conventions.
---

# FoC UI Iteration

Use only for an approved feature with user-visible interaction. Read the owning
service guidance, relevant screens/components, and feature brief before editing.

For Supplier frontend work, inspect the relevant Figma desktop, mobile, and
shared-component nodes; retain the FoC visual language while resolving genuine
API or accessibility gaps. Use one responsive component tree, local tokens and
components, the generated API client, and TanStack Query. Do not use client-side
role flags as authorization or hand-write API contracts already available from
OpenAPI.

Implement the smallest coherent flow. Prepare manual checks for the affected
workflow at the mobile reference width and desktop layout, keyboard/focus access,
validation/error feedback, and affected-route regressions. Return behavior and
the checklist to `/foc-quality-review` and `/foc-verify-feature`; do not declare
acceptance yourself.
