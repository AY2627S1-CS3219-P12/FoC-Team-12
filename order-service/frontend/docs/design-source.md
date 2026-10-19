# Order frontend design sources

Figma: [flat siuu (Copy)](https://www.figma.com/design/LVJfwfN3VxUoDXzjXd6IgD/flat-siuu--Copy-?node-id=0-1&t=Gzn5jlI6XasO7y5t-1).
The frames were shared as screenshots, so node IDs are not recorded yet.

| Frame | Route | Notes |
| --- | --- | --- |
| Browse errands ("Run an errand") | `/errands/browse` | Open pool with filters and sort |
| Errand details | `/errands/:orderId` (viewer is not a participant) | Accept with confirmation |
| Courier active order ("You're the courier") | `/errands/:orderId` (viewer is the courier) | Pick up, deliver, withdraw |
| Requester active order ("Have you received…") | `/errands/:orderId` (viewer is the requester) | Confirm receipt, cancel |
| My errands (no frame; uses the same cards) | `/errands/mine` | F9 history lists |
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
  credit account yet, or when the reward is higher than the available credits. Credit still has the
  final say: a reservation it rejects later (for example two errands posted at once) shows as
  "Not enough credits" on the errand.
- **Requester/Courier tabs** ("Request help" / "Run errands") map to the session role switch in the
  header, because the API authorises actions by the session role.
