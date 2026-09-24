# Repository agent boundaries

Before coding, identify the target service named in the task. Read [`TASK_SPLIT.md`](TASK_SPLIT.md)
and that service's `AGENTS.md`. If the task does not name a service or owner, ask rather than
choosing one.

- Work only in the identified service's folder and explicitly assigned nice-to-have area.
- Do not edit another service, database, API contract, or frontend to make your task pass.
- Keep service data private; cross-service integration uses explicit APIs or events.
- Root files such as `compose.yaml`, `.env.example`, and CI configuration are shared: one owner
  edits them and affected service owners review.
- Do not guess missing product rules. Flag them for confirmation against the backlog/wireframes.
- Update tests and the service README when implementation behavior changes.
