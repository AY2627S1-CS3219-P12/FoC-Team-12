# Order Service agent boundary

Owner: XueTing.

## In scope

- Request creation, validation, editing, cancellation, acceptance, and courier withdrawal.
- Order state transitions, lifecycle history, expiry/disconnection handling, filtering/sorting,
  concurrency, and acceptance races.
- Notifications and shared event names, schemas, transitions, and consumer expectations.
- Order database, migrations, tests, and API/event contracts.

## Out of scope

Do not implement user accounts, supplier master data, credit balances/ledger rules, logging, or
chat. Reference other domains by ID and use their published contracts.

Order owns lifecycle facts; Credit decides the corresponding ledger effects. Do not invent the
state machine, expiry timing, or cancellation permissions if the backlog does not define them.
