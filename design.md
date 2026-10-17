# Friend on Campus UI/UX Standard

This is the shared design source for every FoC frontend. Read it before planning, implementing or
reviewing UI work. Preserve working behaviour and established patterns unless a change produces a
clear usability, accessibility or cross-service consistency improvement.

## Product principles

- Present FoC as one application, not a collection of unrelated service dashboards.
- Prefer familiar, direct flows with clear labels and the fewest necessary steps.
- Keep navigation, identity, role switching and account actions consistent on every route.
- Reuse existing components and tokens before creating variants.
- Preserve functionality during visual changes; UI cleanup must not remove supported actions.
- Design mobile and desktop behaviour together, including loading, empty, success and error states.

## Visual foundation

Use the existing FoC palette and tokens. New frontends should expose equivalent CSS custom
properties rather than introducing a separate theme.

| Purpose | Value |
| --- | --- |
| Canvas | `#f5f7f5` |
| Surface | `#ffffff` |
| Primary text | `#20332d` |
| Muted text | `#57655f` |
| Primary action | `#23654e` |
| Soft action state | `#e7f1ed` |
| Border | `#d4ddd7` |
| Danger | `#a2372b` |
| Focus | `#176bba` |
| Warning background | `#fff3dc` |
| Shadow | `0 10px 30px rgb(32 51 45 / 8%)` |

- Typography: `'Public Sans', system-ui, sans-serif`; use `700` for brand/primary emphasis and
  `600` for navigation and labels. Do not substitute a service-specific display font.
- Spacing: prefer the existing `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem` and
  `3.5rem` scale.
- Corners: `0.5rem` for controls/menus, `0.75rem` for cards and `999px` for chips.
- Controls: interactive targets should be at least `2.75rem` high, except compact segmented
  controls, which should be at least `2rem` high.
- Layout: shared header content is at most `80rem`; normal page content is at most `76rem`; support
  screens down to `20rem` without horizontal scrolling.

## Shared application shell

- Use the 24px FoC bag mark and the label **Friend on Campus** with identical size and weight.
- Keep the header at a stable `5rem` desktop height so switching routes does not move or resize it.
- Use the same primary route order and labels: **Profile**, **Suppliers**, **Credits**, followed by
  newly approved product areas. Indicate the current page with green text and a 3px underline.
- Keep the account avatar/name, role selector and dropdown dimensions consistent across services.
- The account menu must expose every action available for the current session. Admins must see
  **Manage users** and **Switch to User**; eligible users must see **Switch to Admin**.
- Close menus after navigation, role switching or sign-out.
- On small screens, retain all actions, allow the navigation to occupy a second row, and visually
  hide long brand/account text when required instead of removing its accessible name.

## Components and interaction

- Primary buttons use the action colour with white text. Secondary actions use a bordered or text
  treatment; destructive actions use the danger colour and require clear confirmation when the
  effect is difficult to undo.
- Cards use a white surface, 1px border, `0.75rem` radius and the shared shadow only when elevation
  communicates grouping or interaction.
- Forms use visible labels, appropriate autocomplete attributes, inline validation and a clear
  submit result. Disable repeated submissions while a request is running.
- Use plain, user-facing language. Do not expose service names, event terminology, database terms
  or implementation details unless the screen is an explicitly technical/admin tool.
- Show useful loading, empty and recovery states. Errors must say what happened and what the user
  can do next without exposing internal exception messages.
- Preserve user context after authentication and role changes, unless access rules require a safe
  redirect.

## Accessibility and responsive behaviour

- Every interaction must work with keyboard only and have a visible `3px` focus indicator.
- Use semantic controls, headings, landmarks and `aria-current`, `aria-live` or `role="alert"`
  where their meanings apply. Do not rely on colour alone.
- Associate fields with labels and error messages. Decorative icons use an empty accessible label;
  meaningful icon-only buttons require an accessible name.
- Respect `prefers-reduced-motion` and avoid unnecessary animation.
- Verify the affected flow at mobile and desktop widths and with long names/content.

## Agent workflow and ownership

1. Read this file, the applicable `AGENTS.md`, and the affected frontend before proposing changes.
2. Follow the current UI where it already satisfies this standard; prefer extending shared
   components/tokens over copying them into another service.
3. An agent may change another owner's frontend only when necessary to fix a material shared-shell,
   accessibility or end-to-end usability inconsistency. Keep the change as small as possible,
   avoid backend/API/database changes, and request review from every affected service owner.
4. Update tests for changed behaviour and manually check affected routes, roles, menus, responsive
   layouts, keyboard focus and error states.
5. Update this file in the same change whenever a shared visual token, navigation rule, component
   convention or cross-service interaction standard changes. Page-specific copy or layout changes
   do not require an update unless they establish a new shared convention.

When this file conflicts with a feature-specific approved design, document the exception and its
scope. Do not silently create a second global convention.
