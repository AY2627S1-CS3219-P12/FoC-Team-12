# Notification Service

Owner: XueTing. Read [blueprint](README.md) before choosing an iteration. Documentation-only
scaffold; do not claim runnable commands or implemented adapters until code exists.

Own private notification persistence, inbox/deduplication, event mapping and retrieval UI/API.
Use verified JWT subject for recipient access. A committed source event creates at most one
logical notification per intended recipient; preserve real repeated lifecycle occurrences.
No Order state changes, Credit arithmetic, Chat storage, email verification or Admin case policy.

Read shared core/lifecycle contracts linked in README; producer owners approve wire changes.
Do not share another service's consumer group or database. Add tests/README/CI when code exists;
shared gateway/Compose/broker/env/CI changes use the nominated editor/affected-review rule.
Use root `$foc-iterate-feature` workflow, one bounded outcome with live UI where applicable.
