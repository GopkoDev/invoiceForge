---
id: T104
title: "The per-minute chat limit is atomic in the shared limit store and refusals write no turn rows (SEC-L-05, SEC-I-06 code)"
layer: "migration"
deps: ["T103"]
blocks: []
acs: []
files_hint: ["prisma/schema/auth.prisma", "lib/security/limits/scopes.ts", "app/api/chat/route.ts", "lib/services/assistant-usage/turns.ts", "types/result.ts", "tests/integration/api/chat-route.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T104 — The per-minute chat limit is atomic in the shared limit store and refusals write no turn rows (SEC-L-05, SEC-I-06 code)

Follow-up task from the security re-check of 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Re-check after T99–T102).

## Problem

The 10/min limit counts finished AssistantTurn rows, so parallel requests overrun it, and every refusal writes a turn row kept 400 days; `countRecentTurns` lacks the request-free test the service inventory requires; `TOO_FAST` is not in `types/result.ts` ActionErrorCode.

## Definition of Done

- Add `CHAT_MESSAGE` to `enum LimitScope` (prisma/schema/auth.prisma) with an additive migration following the repo's enum-migration convention (stage under docs/features/ai-chat-v2/migrations/, promote to the live tree, apply + revert in the gate); `LIMIT_SCOPES.CHAT_MESSAGE = { windowMs: CHAT_RATE_WINDOW_MS, max: CHAT_PER_MINUTE_MAX, countedOutcomes: ['REQUESTED'] }`. The chat route, before any reservation or paid call, runs `withKeyLock('CHAT_MESSAGE', <user key>, …)`: count in window ≥ max → 429 TOO_FAST (no AssistantTurn row, no LimitEvent for the refusal); else record REQUESTED (with userId) and proceed. Store unavailable → 503 FAILED (fail closed). Remove `countRecentTurns` (and its import) so the service inventory is green. Add `TOO_FAST` to `types/result.ts` ActionErrorCode. Tests: parallel burst of 15 requests → exactly 10 proceed (integration, Promise.all); refusal writes no AssistantTurn row; form-path refusal; `assertMatchesContract` on the TOO_FAST body; `tests/unit/service-layer-inventory.test.ts` green. Gate: migration apply/revert, chat-route integration under caffeinate, related unit tests incl. the inventory test, tsc, eslint.
- Commit with `SDD-Task: T104`.
