# Team task split

This is the ownership source of truth for developers and Codex agents. Detailed product rules
still come from the approved backlog and wireframes.

| Owner | Mandatory service | Additional responsibility |
| --- | --- | --- |
| Darryl | User Service | Admin Dashboard |
| Jun Hui | Supplier Service | API Gateway, Logging, event-broker reliability, observability |
| XueTing | Order Service | Notifications, event definitions and transitions |
| Eldridge | Credit Service | Chat and Translation |

## Darryl - User Service

Owns registration with NUS email, login/token issuance, reset OTP, profiles, roles/RBAC,
account lifecycle, protected user fields, administrator access, and the Admin Dashboard.

Does not own supplier records, order state, credit balances, notifications, logs, or chat.

## Jun Hui - Supplier Service

Owns Supplier/location data and schema, CRUD and query APIs, active/inactive status, Supplier
UI, Supplier authorization integration, logging, event-delivery reliability, and observability.

Does not own user identity, order transitions, credit rules, notifications, or chat.

## XueTing - Order Service

Owns request creation/editing/cancellation, courier acceptance/withdrawal, lifecycle and expiry,
filtering/sorting, concurrency races, notifications, and shared event names/transitions.

Does not own user accounts, supplier master data, credit ledger effects, logging, or chat.

## Eldridge - Credit Service

Owns initial 10-credit allocation, accounts, reservations, releases, transfers, transaction
history, 20-percent cancellation compensation, nonnegative/idempotent credit operations, and
Chat plus Translation.

Does not own user authentication, supplier data, order transitions, notifications, or logs.

## Shared work

Cloud infrastructure, integration, CI/CD, responsive end-to-end flows, demos, and final
submission are shared. Jun Hui implemented the initial API Gateway foundation (Task 16B), but the
gateway remains shared infrastructure with no permanent maintainer. Each later gateway change must
nominate one implementer and obtain review from every affected service owner. For any shared file,
do not have multiple agents edit it independently.

## Rules that prevent overlap

1. Implement only inside the service folders assigned above, except for an agreed shared-file
   change.
2. A service is the only writer of its database. Never query or migrate another service's DB.
3. Integrate through documented APIs/events, not another service's internal classes.
4. The producing service owns its contract; consumers request changes instead of inventing
   fields or behavior.
5. Order owns lifecycle transitions; Credit alone owns balance and ledger changes.
6. User owns identity and roles; every backend still enforces authorization locally.
7. If the backlog/wireframe does not define a behavior, record the question and stop at that
   boundary rather than guessing.
