# Order frontend design sources

Figma: [flat siuu (Copy)](https://www.figma.com/design/LVJfwfN3VxUoDXzjXd6IgD/flat-siuu--Copy-?node-id=0-1&t=Gzn5jlI6XasO7y5t-1).
The frames were shared as screenshots, so node IDs are not recorded yet.

| Frame | Route | Notes |
| --- | --- | --- |
| Browse errands ("Run an errand") | `/errands/browse` | Open pool with filters and sort |
| Errand details | `/errands/:orderId` (viewer is not a participant) | Accept with confirmation |
| Courier active order ("You're the courier") | `/errands/:orderId` (viewer is the courier) | Pick up, deliver, withdraw |
| Requester active order ("Have you received…") | `/errands/:orderId` (viewer is the requester) | Confirm receipt, cancel |
| My errands (no frame; uses the same cards) | `/errands/mine` | F9: Active and Past errands for the header role (Requester: posted; Courier: running and delivered) |
| Create errand ("Request a hand") | `/errands/new` | Post an errand; "Your credits" card |

## Visual language

Same tokens as the Credit and Supplier frontends: Public Sans; canvas `#f5f7f5`, surface white,
ink `#20332d`, muted `#57655f`, action `#23654e`, border `#d4ddd7`; 12 px card radius; 375 px mobile
and 1280 px desktop reference widths.

## Adaptations to the API

The backend contract wins over example data in Figma:

- **No "Deliver by" time.** Orders only have a pickup deadline, so "Deliver by" is not shown.
- **No "Maximum distance" filter or "Closest pickup location" sort.** The API has no distance; the
  filters are minimum/maximum reward and the sorts are nearest deadline, highest reward and pickup
  location name.
- **"Errand FOC-1042"** is shown as a short reference derived from the order UUID.
- **"Requested by Mei Lin" / "Alex marked…"** need usernames, which Order Service does not store
  (it only has user IDs), so the UI says "the requester" / "your courier".
- **Chat, Notifications and "Report an issue"** have no backend yet and are not shown.
- **Locations are picked from a list, not typed.** The form loads active locations from Supplier's
  public `GET /api/suppliers` in the browser and sends both the ID and name; Order Service still
  never calls Supplier.
- **No "Deliver by" field.** Orders have only a pickup deadline. A **reward** field is added: the
  design shows "Reserve for this errand: 3 credits" but has no input for it.
- **"Your credits"** reads the caller's own balance from Credit's `GET /api/credits/me` in the
  browser (Order Service never calls Credit). **Post errand is disabled** unless that balance is
  confirmed and covers the reward: while it loads, when Credit is unavailable, when the user has no
  credit account yet, or when the reward is higher than the available credits.
- **A refused reservation names its reason** on the errand page and its status badge, from
  `terminalReason`: "Not enough credits", "Credit account not set up" (with a link to set it up) or
  "Credits couldn't be reserved" ("Not posted" badge) for any other reason.
- **Posting waits for the reservation.** After Post errand the form locks ("Reserving your
  credits…") and the page reads the new errand every second. It opens the errand once Credit
  reserves the reward. If Credit rejects it (for example two errands posted at once), the form
  stays filled in and explains why from the errand's `terminalReason`: not enough credits, no
  credit account (with a link to set it up), or a generic retry message; a deadline that passes
  while waiting is explained too. After 30 seconds without an answer the form unlocks and links to
  the errand, which opens on its own once Credit answers.
- **Requester/Courier tabs** follow the session role switch in the header, because the API
  authorises actions by the session role. A Requester sees **Request help · My errands**, a Courier
  **Run errands · My errands**, as side-by-side text tabs with an underline on the current one.
  Opening the other role's screen, or switching role while on one, goes to the current role's own
  screen (`/errands/new` for Requester, `/errands/browse` for Courier).
