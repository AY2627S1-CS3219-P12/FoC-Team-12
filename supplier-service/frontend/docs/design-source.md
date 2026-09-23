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
