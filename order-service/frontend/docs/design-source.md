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
| Create errand ("Request a hand") | not in this iteration | |

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
- **Requester/Courier tabs** ("Request help" / "Run errands") map to the session role switch in the
  header, because the API authorises actions by the session role.
