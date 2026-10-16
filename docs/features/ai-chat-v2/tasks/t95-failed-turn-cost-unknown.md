---
id: T95
title: "A failed turn's unknown router cost is null, and the router verdict always carries its cost (review round 2 N3)"
layer: "backend"
deps: ["T93"]
blocks: []
acs: []
files_hint: ["lib/ai/run-turn.ts", "lib/ai/router.ts", "tests/integration/lib/ai/run-turn.test.ts", "tests/unit/lib/ai/gateway-cost.test.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T95 — A failed turn's unknown router cost is null, and the router verdict always carries its cost (review round 2 N3)

Follow-up task from round 2 of the ADR-0014 review, 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md) (Round 2).

## Problem

`failed()` in `lib/ai/run-turn.ts:249` defaults `costUsd: 0`, so a router call that throws after a billed response is stored as free; the comment at `:58` says '0 when none is reported'; `RouterVerdict.costUsd` is optional, leaving an `undefined → 0` branch at `:274`.

## Definition of Done

- `failed()` defaults `costUsd: null`; the `:58` comment matches T91's semantics; `RouterVerdict.costUsd` is a required `number | null`, the `=== undefined ? 0` branch is removed, and test doubles that build verdicts set it. A turn that made no model call at all still records 0 only where no call was made (keep the route's pre-model refusal path). Tests cover the router-throw path storing null. Scoped gate: related unit tests, the run-turn and chat-route integration files, tsc, eslint on changed files.
- Commit with `SDD-Task: T95`.
