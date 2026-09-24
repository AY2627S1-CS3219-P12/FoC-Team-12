# Supplier frontend design sources

The Figma file is a visual and workflow reference for the responsive Supplier UI. It was produced quickly, so implementation may improve information hierarchy and task flow while preserving its overall Friend on Campus visual language.

## Canonical references

- [Desktop screens and flows](https://www.figma.com/design/C0Y1GNnZrxvPX36oQemnff/Friend-on-Campus-%E2%80%94-Impeccable-Redesign?node-id=3-3&t=itVba3jHlA5ZxVp0-1)
  - Supplier L01 Location administration: node `6:6731`
  - Supplier L02 Create location: node `6:6795`
  - Supplier L03 Edit location and validation: node `6:6855`
  - Supplier L04 Delete confirmation: node `6:6925`
  - Supplier L05 Delete success: node `6:6965`
- [Mobile Supplier starting point](https://www.figma.com/design/C0Y1GNnZrxvPX36oQemnff/Friend-on-Campus-%E2%80%94-Impeccable-Redesign?node-id=7-1421&t=itVba3jHlA5ZxVp0-1): node `7:1421`
- [Shared components section](https://www.figma.com/design/C0Y1GNnZrxvPX36oQemnff/Friend-on-Campus-%E2%80%94-Impeccable-Redesign?node-id=4-198&t=itVba3jHlA5ZxVp0-1): node `4:198`
- [Public directory reference](https://www.figma.com/design/C0Y1GNnZrxvPX36oQemnff/Friend-on-Campus-%E2%80%94-Impeccable-Redesign?node-id=6-1420&t=itVba3jHlA5ZxVp0-1): R02 node `6:1420`

The shared-components link currently targets the section heading. When implementing a component, inspect the component instances used by the target screen and then locate the corresponding component beneath that section.

## API references

With Supplier Service running:

- Swagger UI: <http://localhost:8080/swagger-ui/index.html>
- OpenAPI JSON: <http://localhost:8080/v3/api-docs>
- Supplier API: <http://localhost:8080/api/suppliers>

The backend contract takes precedence over example data and incomplete form fields in Figma. In particular, the real Supplier model includes building information, optional location details, operating hours, image URL, status, timestamps, and optimistic-lock versioning.

## Current design vocabulary

- Typeface: Public Sans, bundled locally.
- Canvas: `#f5f7f5`; surface: white; ink: `#20332d`; muted: `#57655f`; action: `#23654e`; border: `#d4ddd7`.
- Primary spacing steps: 8, 12, 16, 24, 32, and 56 pixels.
- Primary card radius: 12 pixels.
- Mobile reference width: 375 pixels; desktop reference width: 1280 pixels.

Use the CSS custom properties in `src/styles/tokens.css` rather than copying raw values throughout components.

## Task 13 directory adaptations

The public Supplier experience deliberately adapts R02 rather than reproducing its Order
Service workflow:

- “Choose a pickup location” becomes a standalone “Campus locations” directory, with no
  selection action.
- Search is joined by API-backed category and building filters, safe sorting, result totals,
  and pagination because the real Supplier API supports those operations.
- Cards become a responsive one-, two-, or three-column grid and include operating hours and
  directions when available.
- A separate detail route shows coordinates and optional images; administrative version and
  timestamp fields stay hidden.
- Unimplemented global navigation and the Admin route are not linked from the public shell.
  The Admin scaffold remains directly reachable for later authenticated work.
- The exact Figma bag and arrow vectors are committed under `src/assets/`; no expiring Figma
  asset URLs are used at runtime.
- Supplier details use a local, Figma-aligned campus storefront illustration when a photo is
  missing, loading, or unavailable. This preserves the image layout without implying that a
  generic photograph depicts the real location.
