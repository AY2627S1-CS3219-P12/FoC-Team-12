# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

**Friend on Campus (FoC)** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money. Normal transfers circulate within the platform; the agreed
Admin N2H additionally permits audited corrective issuance/removal by authorized administrators.

---

## Team Members

| Name | Mandatory service | Additional ownership |
| ---- | ----------------- | -------------------- |
| Darryl | User Service | Admin Service and Dashboard |
| Jun Hui | Supplier Service | Event-broker reliability, timeline delivery/recovery, observability |
| XueTing | Order Service | Notifications, event definitions and transitions |
| Eldridge | Credit Service | Chat and Translation, including activity timeline |

Cloud infrastructure, integration, CI/CD, and demonstrations are shared responsibilities.
The detailed task boundaries are in [`TASK_SPLIT.md`](TASK_SPLIT.md).

Admin N2H implementation starts with the [Admin specification](docs/integration/admin-service-spec.md),
[Chat evidence/conversation contract](docs/integration/chat-admin-contract.md) and
[Kafka administrative actions](docs/integration/admin-command-contract.md). These describe planned
work and affected-owner review requirements; they do not indicate deployed services. The previous
separate Logging Service plan is replaced by a Chat-owned event timeline.

Owner-ready N2H blueprints: [Notification Service](notification-service/README.md) (XueTing)
and [Chat Service](chat-service/README.md) (Eldridge). Their folders currently contain documentation
and agent boundaries only; they are not runnable services yet.

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`,
`credit-service/`) lives in its own top-level folder. The shared, stateless
`gateway-service/` provides the public API entry point without owning domain data.

```text
.
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── gateway-service/
├── <n2h-service>/
└── README.md
```

- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

## Working with agents

The [N2H contract package](docs/contracts/README.md) contains machine-readable OpenAPI/JSON
schemas, shared examples and validation commands for owner review before integration work.

| Document | Responsibility |
| --- | --- |
| [Root AGENTS.md](AGENTS.md) | Universal rules, reading path and cross-service review |
| [TASK_SPLIT.md](TASK_SPLIT.md) | Teammate and service ownership map |
| Each service's AGENTS.md | Local scope and critical implementation invariants |
| Each service's README.md | Architecture, behavior/contracts and verification commands |
| Order/Credit IMPLEMENTATION_CHECKLIST.md | D3 iteration order and acceptance evidence |
| [.codex/skills](.codex/skills) | Reusable feature stages and commit workflow |

Each teammate works in their own branch/checkout and service area. Use
`$foc-iterate-feature <service>-<iteration>: <outcome>` to define and approve one feature,
then design tests, implement, review, verify and obtain manual acceptance. Request `$foc-commit`
separately. Existing approvals carry through repairs within the same scope.

For integration, agree the producer's contract before parallel implementation. Shared files and
gateway changes have one editor with affected-owner review, preventing competing agent edits.

## API Gateway

CI publishing and one-time Docker Hub credential setup are documented in
[the CI guide](.github/README.md). Successful main-branch CI publishes versioned images;
developers choose when to [apply them to local Minikube](deploy/k8s/README.md#apply-a-ci-published-service-update).

The course-aligned Minikube deployment is documented in
[`deploy/k8s/README.md`](deploy/k8s/README.md), with service manifests beside each Dockerfile.

Run the Docker stack and use `http://localhost:8088` as the normal browser and API origin. The
gateway serves the packaged User application at `/`, the Supplier application under `/suppliers`,
the Credit dashboard at `/credits`, and the current APIs from the same origin:

```text
/                             -> User login and profile
/suppliers/**                 -> Supplier public UI
/admin/suppliers/**           -> Supplier administration UI
/credits/**                   -> Credit dashboard
/api/users/**                -> User Service
/api/suppliers/**            -> Supplier Service
/api/admin/suppliers/**      -> Supplier Service
/api/credits/**              -> Credit Service
```

Order Service is deployed through Compose and Kubernetes at `/api/orders/**`, with packaged
frontend `/errands/**`, assets `/order-assets/**` and OpenAPI `/docs/order/openapi.json`.
The shared local Kafka broker, topics, ACLs and verification workflow are
documented in [`deploy/kafka/README.md`](deploy/kafka/README.md); application adapters remain
separate owner-reviewed work. Its authenticated, read-only local Kafka dashboard is available at
`http://localhost:8090` when the `kafka-ui` Compose service is running. This dashboard is local
operational tooling and is not routed through the application gateway.

Keeping the packaged frontends on `8088` lets their browser code share the validated
`sessionStorage["foc.user-session"]` login session. Direct ports `8080`, `8081` and `8083` remain exposed
for service-owner debugging, but they are not the normal presentation flow.

Gateway Swagger UI is available at `http://localhost:8088/swagger-ui/index.html`. See
[`gateway-service/README.md`](gateway-service/README.md) for the complete route table, local-run
instructions, bundle paths, and shared route ownership rules.

---
