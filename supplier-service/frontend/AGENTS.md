# Supplier Frontend Instructions

These instructions apply to all work in `supplier-service/frontend/`.

## Sources of truth

- Inspect the relevant desktop, mobile, and shared-component Figma nodes before implementing a screen. Canonical links and known node IDs are in `docs/design-source.md`.
- Use the running Supplier OpenAPI contract at `/v3/api-docs` and the Supplier README as the API source of truth. Do not infer request fields from the draft Figma forms.
- Do not edit the Figma file unless the user explicitly requests a design change.

## Design implementation

- Build one responsive component tree. Do not create separate desktop and mobile applications.
- Treat Figma as the visual-language and workflow baseline, not an inflexible product specification.
- Thoughtful deviations are allowed when they improve API fit, information hierarchy, accessibility, responsive usability, or task flow. Preserve the established visual language and record material deviations in the relevant handoff or documentation.
- Reuse the CSS design tokens and existing local components before creating new equivalents.
- Use every real Supplier field required by the API even when it is absent from a draft Figma form. This includes `building`, optional details and hours, status, and optimistic-lock versions where relevant.
- Download and commit required Figma assets. Figma MCP asset URLs expire and must not remain in production code.
- Keep controls keyboard accessible, maintain visible focus states, respect reduced-motion preferences, and test both narrow mobile and desktop layouts.

## Architecture and security

- Keep Supplier frontend code, tests, and assets inside this frontend directory.
- Use the shared typed API client and TanStack Query for server state. Do not duplicate API contracts manually when generated OpenAPI types are available.
- Share components between public and administrative routes where their behavior is genuinely the same.
- UI route guards and hidden controls are only user experience measures. The backend must enforce authentication and authorization.
- Do not add fake roles, trusted client-side admin flags, or simulated JWT claims.

## Verification and generated contracts

- For frontend changes, run `npm run lint`, `npm run typecheck`, `npm test`, and
  `npm run build` from this directory. Report each skipped or unavailable check
  separately.
- Regenerate `src/api/schema.d.ts` only after an actual Supplier OpenAPI contract
  change and only against a running service at `http://localhost:8080/v3/api-docs`.
  Review and commit the generated diff with the corresponding backend contract
  change; do not hand-edit generated declarations.
- Manually check affected flows at the 375px mobile reference and desktop layout,
  including keyboard access, visible focus, validation/error feedback, and the
  relevant unchanged route.
