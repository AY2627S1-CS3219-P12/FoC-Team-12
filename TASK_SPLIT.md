# Team ownership

| Owner | Service guidance | Additional responsibility |
| --- | --- | --- |
| Darryl | [User](user-service/AGENTS.md) | Admin Dashboard |
| Jun Hui | [Supplier](supplier-service/AGENTS.md) | Logging, broker reliability, observability; initial API Gateway foundation |
| XueTing | [Order](order-service/AGENTS.md) | Notifications, lifecycle event definitions and transitions |
| Eldridge | [Credit](credit-service/AGENTS.md) | Chat and Translation |

Service instructions define detailed scope. User owns identity/roles, Supplier owns location
master data, Order owns lifecycle facts, and Credit owns balance/ledger effects.

[Gateway](gateway-service/AGENTS.md) has no permanent maintainer: nominate one implementer for
each change and obtain affected-owner review. Cloud infrastructure, integration, CI/CD,
responsive end-to-end flows, demos and final submission are shared.

Working and contract-review rules are in [root AGENTS.md](AGENTS.md). Product requirements come
from the approved backlog and wireframes, not this ownership table.
