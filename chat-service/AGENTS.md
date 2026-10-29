# Chat Service

Owner: Eldridge. Read [blueprint](README.md) and linked Chat/Admin contract for the affected work.
Documentation-only scaffold; do not claim implemented endpoints or runnable checks yet.

Own conversations, participant permissions, ordered messages, private images, translation and
durable activity timeline. Keep original messages, isolate private case conversations, enforce
terminal/read-only state and deduplicate sends/events. Authorization applies equally to REST,
WebSocket and image access. Never mutate Credit, User or Order data or infer their outcomes.

Do not implement the proposed historical-courier message visibility rule until approved; the
README records this product ambiguity explicitly. Do not silently change shared event/API schemas.
Keep Chat and Credit databases independent despite the common developer owner.

Use root `$foc-iterate-feature` stages. Update tests/README and add CI when code exists. Shared
gateway/Compose/broker/env/CI changes require a nominated editor and affected-owner review.
