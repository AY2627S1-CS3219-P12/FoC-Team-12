# Gateway Service agent boundary

Ownership: shared infrastructure with no permanent maintainer. Every gateway change must name
one implementer, and every affected service owner must review it.

## In scope

- Edge routing, forwarded headers, gateway health, gateway documentation, and cross-service route
  verification.
- Routes only for paths, ports, and contracts published by the service that owns them.

## Out of scope

- Domain logic, service data, database access, JWT signing keys, user/session ownership, or
  authorization decisions that belong to downstream services.
- Guessing routes for services that have not published an API contract.
- Editing another service to make a gateway change pass without that service owner's agreement.

The gateway must preserve downstream methods, paths, query strings, request/response bodies,
authorization headers, status codes, and error media types unless an approved route contract
explicitly requires a transformation.
