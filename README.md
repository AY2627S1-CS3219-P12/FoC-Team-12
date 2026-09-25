# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

**Friend on Campus (FoC)** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.

---

## Team Members

| Name | Mandatory service | Additional ownership |
| ---- | ----------------- | -------------------- |
| Darryl | User Service | Admin Dashboard |
| Jun Hui | Supplier Service | Logging, event-broker reliability, observability |
| XueTing | Order Service | Notifications, event definitions and transitions |
| Eldridge | Credit Service | Chat and Translation |

Cloud infrastructure, integration, CI/CD, and demonstrations are shared responsibilities.
The detailed task boundaries are in [`TASK_SPLIT.md`](TASK_SPLIT.md).

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

## API Gateway

Run the Docker stack and use `http://localhost:8088` as the normal browser and API origin. The
gateway serves the packaged User application at `/`, the Supplier application under `/suppliers`,
and the current APIs from the same origin:

```text
/                             -> User login and service hub
/suppliers/**                 -> Supplier public UI
/admin/suppliers/**           -> Supplier administration UI
/api/users/**                -> User Service
/api/suppliers/**            -> Supplier Service
/api/admin/suppliers/**      -> Supplier Service
```

Keeping both applications on `8088` lets their browser code share the validated
`sessionStorage["foc.user-session"]` login session. Direct ports `8080` and `8081` remain exposed
for service-owner debugging, but they are not the presentation flow and do not share browser
storage with `8088`.

Gateway Swagger UI is available at `http://localhost:8088/swagger-ui/index.html`. See
[`gateway-service/README.md`](gateway-service/README.md) for the complete route table, local-run
instructions, bundle paths, and shared route ownership rules.

---
