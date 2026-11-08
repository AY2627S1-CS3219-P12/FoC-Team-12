# FoC product design contract

This is the shared UI/UX source of truth for every Friend on Campus frontend. It records the
implemented product language rather than a one-off mock-up. Product behaviour still comes from
the owning service's requirements, API and tests; this document governs how that behaviour is
presented and how cross-service journeys remain coherent.

## Product experience

FoC should feel like one campus application, not a collection of service dashboards.

- Start with the user's task: request help, run an errand, find a supplier or understand credits.
- Use plain, action-led language. Explain consequences before irreversible actions.
- Keep primary actions obvious and secondary detail quiet. Do not fill screens with decorative
  cards, gradients, badges or explanatory copy that does not help a decision.
- Preserve context across service routes. Navigation, identity and selected role must not jump,
  resize or silently reset when a different service renders the page.
- Prefer a clear empty state with the next useful action over an empty table or developer message.
- Never simulate success, identity, permissions, balances or lifecycle state in the browser.

## Shared application shell

All signed-in service pages use the same shell and order:

1. Friend on Campus brand, linking to `/`.
2. `Home`, `Errands`, `Suppliers`, `Credits`; append `Admin` only in Admin mode.
3. Requester/Courier selector for participant modes.
4. Notification bell, signed in only: a Lucide `Bell` linking to `/notifications`, with the unread
   count as a small badge (`9+` above nine) and in its accessible name ("Notifications, 3 unread").
   It is `2.75rem` square and marked current on the Notifications page.
5. Account menu with profile, permitted administration actions and sign out.

The bell is the same `NotificationBell.tsx` and `useUnreadCount.ts` copied into every frontend's
`src/components/`; Notification Service owns them and the copies must stay identical. It polls only
the unread count, about every 30 seconds while the tab is visible, keeps the last count when a poll
fails rather than showing `0`, and stops when the session ends.

The active route uses text colour plus a 3 px underline. Navigation items use Lucide outline icons
with accessible text; icons are supporting cues, not replacements for labels. Desktop headers are
`4.5rem` high with an `80rem` maximum content width. At narrow widths the navigation becomes a
horizontal, keyboard-accessible row rather than wrapping or dropping destinations.

### Role selector contract

The Requester/Courier selector is one control shared by every frontend:

- Outer options box: inline flex, vertically centred, `3px` padding, `1px` neutral border,
  `8px` radius and white surface; its rendered height is `40px`.
- Buttons: inline flex, centred, `32px` fixed height, `8px` horizontal padding, `6px` radius,
  `12.48px` (`0.78rem`) semibold text and unit line height.
- Selected state: action green surface, white text and `0 1px 2px rgb(23 32 51 / 18%)` shadow.
- Hover affects only the hovered choice; disabled/busy controls must not accept another switch.
- Use `role="group"`, accessible label `Choose your current role` and `aria-pressed` on both
  choices. Keyboard focus must remain visible.

Changing role calls the User Service session-role endpoint. Only a valid replacement response may
replace the stored JWT and selected role. While pending, both choices are disabled. On failure,
keep the previous JWT and role, show an actionable error and leave backend authorization
authoritative. A role switch must not alter balances, orders, profiles or other domain data.

## Foundations

### Colour

| Purpose | Value |
| --- | --- |
| Canvas | `#f3f6f4` |
| Surface | `#ffffff` |
| Primary ink | `#20332d` |
| Muted ink | `#57655f` |
| Action | `#23654e` |
| Action soft | `#e7f1ed` |
| Border | `#d4ddd7` |
| Danger | `#a2372b` |
| Keyboard focus | `#176bba` |

Meet WCAG AA contrast for text and controls. Never communicate status using colour alone.

### Type, spacing and shape

- Use Public Sans with system sans-serif fallback and inherit it for all form controls.
- Use a restrained type hierarchy: compact navigation, readable `1rem` body copy and responsive
  page headings. Avoid oversized dashboard metrics unless the value is the page's main purpose.
- Base spacing on multiples of `0.25rem`; prefer `0.5`, `0.75`, `1`, `1.5`, `2` and `3rem`.
- Controls are at least `2.75rem` high except compact segmented controls. Cards normally use
  `0.875–1rem` radii; pills are reserved for short statuses or filters.
- Use the shared soft shadow for elevation. Hover movement is subtle (`1–2px`) and must not move
  surrounding layout.

## Components and interaction

- **Buttons:** one clear primary action per local decision area. Use real buttons for actions and
  links for navigation. Provide hover, focus, active, busy and disabled states.
- **Forms:** keep labels visible, validate near the field, preserve valid input after errors and
  state the required format before submission where helpful.
- **Feedback:** distinguish loading, empty, success, warning and error states. Loading placeholders
  should preserve final layout. Errors describe recovery without exposing internal details.
- **Cards and lists:** use cards to group related actions or records, not as decoration. Lists and
  tables need meaningful headings and responsive alternatives where horizontal reading fails.
- **Menus:** close after a successful selection or navigation. Do not close on a failed role
  change if the error needs context.
- **Icons:** use Lucide React icons with consistent stroke weight. Do not use emoji as production
  interface icons or mix unrelated icon families.
- **Motion:** keep transitions near `150–200ms`; respect `prefers-reduced-motion` and never require
  animation to understand state.

## Key journeys

- Signed-out users see the FoC value and sign-in/register path without being shown an internal
  service dashboard. Authentication progress, verification and recovery remain explicit.
- Signed-in Home prioritises requesting help and running errands, then exposes Suppliers, Credits
  and account information.
- Errand screens adapt actions to the active Requester/Courier role while preserving access to the
  user's own active and historical errands.
- Suppliers remain a discoverable participant destination; administration actions appear only in
  Admin mode and are still enforced by the Supplier backend.
- Credits are an account view inside the main application, not a separate dashboard. Account
  creation and initial allocation are platform processes, not user-facing setup actions.

## Responsive and accessible delivery

Every affected journey must be checked at desktop and `375px` width, with keyboard-only input.
Semantic landmarks, headings, labels and live error messages are required. Do not remove focus
outlines, depend on hover, trap keyboard focus or hide required navigation on small screens.
Content must tolerate zoom, long usernames and empty/slow/error responses without overlap.

## Ownership and change control

Service owners retain their frontend behaviour and API boundaries. A shared-UI assignment may
update multiple frontends only when its cross-service scope and editor are explicitly approved;
it does not authorize backend, database or contract changes.

When a material shared design decision changes:

1. Update this file in the same change.
2. Update every affected implementation and regression test together.
3. Obtain review from affected frontend owners.
4. Verify the complete shared shell across Home, Errands, Suppliers, Credits and Admin.

Do not copy this document into service folders. Link to it so there is one maintained contract.

## Completion checklist

- Shared header order, sizing, typography, icons and active state remain consistent across routes.
- Successful role selection replaces both role and JWT; failure preserves both.
- Account menus and navigation behave consistently across services and close when expected.
- No UI-only permission is treated as authorization; protected APIs still enforce access.
- Loading, empty, error, busy and disabled states are usable and do not lose data.
- Desktop, `375px`, keyboard, focus and reduced-motion checks pass.
- Owning frontend lint, type-check, tests and production build pass.
- `.github/scripts/test_ui_design_contract.py` passes for shared visual invariants.
