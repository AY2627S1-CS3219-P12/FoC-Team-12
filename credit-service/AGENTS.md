# Credit Service agent boundary

Owner: Eldridge.

## In scope

- Credit accounts, initial 10-credit allocation, reservations, releases, transfers, immutable
  transaction history, compensation, authorization, nonnegative balances, and idempotency.
- Chat and Translation, including errand chat and administrator case chat.
- Credit/Chat databases, migrations, tests, and API/event contracts.

## Out of scope

Do not implement user authentication, supplier data, Order transitions, notifications, or
logging. Consume User/Order facts through published contracts and never access their databases.

Do not guess the reservation timing, reward transfer, 20-percent compensation basis/rounding,
or Chat privacy/retention rules when the backlog does not define them.
