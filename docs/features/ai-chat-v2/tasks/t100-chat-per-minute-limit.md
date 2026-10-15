---
id: T100
title: "The chat refuses more than 10 messages a minute per Freelancer (SEC-M-01 c)"
layer: "backend"
deps: ["T99"]
blocks: []
acs: []
files_hint: ["app/api/chat/route.ts", "lib/services/assistant-usage", "components/ai/chat-island.tsx", "tests/integration/api/chat-route.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T100 — The chat refuses more than 10 messages a minute per Freelancer (SEC-M-01 c)

Follow-up task from the ADR-0014 security review addendum, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Addendum — ADR-0014 model switch). Owner chose: bounds in code + rate limit; AC-11 unchanged.

## Problem

A failed turn is not counted and gives its slot back (AC-11) and /api/chat has no per-minute limit, so paid calls can be repeated without spending the allowance.

## Definition of Done

- `app/api/chat/route.ts` refuses a request before any model call when the Freelancer already has 10 or more `AssistantTurn` rows created in the last 60 seconds (any outcome; constant exported), with HTTP 429, code `RATE_LIMITED`-style error distinct from the daily allowance (e.g. `TOO_FAST`), the sentence "You're sending messages too quickly. Try again in a minute.", no slot reserved, nothing counted, and a metadata row consistent with the existing pre-model refusal path. The chat island shows that sentence like other 429 notices (check components/ai/chat-island.tsx handling; add the code there if needed). Integration test in tests/integration/api/chat-route.test.ts (10 rows inside the window → 429 and no model call; rows older than 60 s don't count); component test if the island needed a change. Scoped gate: chat-route integration file (under caffeinate), related unit/component tests, tsc, eslint on changed files.
- Commit with `SDD-Task: T100`.
