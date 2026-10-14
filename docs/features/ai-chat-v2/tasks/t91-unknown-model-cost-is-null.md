---
id: T91
title: "A model call with no reported cost is recorded as unknown (null), never as free (review 2026-10-15 F5)"
layer: "backend"
deps: ["T89"]
blocks: []
acs: []
files_hint: ["lib/ai/gateway-cost.ts", "lib/ai/run-turn.ts", "lib/ai/router.ts", "tests/integration/lib/ai/run-turn.test.ts", "tests/integration/api/chat-route.test.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T91 — A model call with no reported cost is recorded as unknown (null), never as free (review 2026-10-15 F5)

Follow-up task from the ADR-0014 review of 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md).

## Problem

`gatewayCostOf` returns 0 when the Gateway reports no `gateway.cost`, justified by the free-tier key. On paid terms (ADR-0014) a missing cost is unknown, and storing 0 makes the p95 cost alert (spec §6, USD 0.02) under-report silently.

## Definition of Done

- `gatewayCostOf` returns `number | null` (null when `gateway.cost` is missing, non-numeric, non-finite or negative; a reported 0 stays 0). A turn whose router or any agent step cost is unknown stores `AssistantTurn.costUsd = null` (the column is nullable); a fully known turn keeps the rounded sum. The comment cites ADR-0014, not the free-tier key. Unit tests cover gatewayCostOf and the sum; the integration tests at `tests/integration/lib/ai/run-turn.test.ts:470` and `tests/integration/api/chat-route.test.ts:766` are renamed and assert null for a call with no reported cost. Check every reader of costUsd (export, KPI queries, metadata spans) handles null. Gate: unit, integration (ai, chat route), lint, typecheck.
- Commit with `SDD-Task: T91`.
