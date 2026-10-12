---
id: T45
title: "Schema-check the stored repeat proposal, make the AC-19 eval row real, and tighten the round-2 tests and docs"
layer: "app"
deps: ["T42", "T43", "T44"]
blocks: []
acs: ["AC-11", "AC-19", "AC-30", "AC-32", "AC-35"]
files_hint: ["lib/services/assistant-drafts/create-for-key.ts", "evals/assistant/", "tests/unit/evals/assistant-eval.test.ts", "tests/component/ai-conversation-list.test.tsx", "tests/component/ai-start-panel.test.tsx", "tests/unit/lib/ai/router.test.ts", "tests/integration/ai-assistant-migrations.test.ts", "tests/integration/services/assistant-drafts/create-for-key.test.ts", "docs/features/ai-assistant/data-model.md"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
origin: "review-2026-10-12 round 3"
---

# T45 — Schema-check the stored repeat proposal, make the AC-19 eval row real, and tighten the round-2 tests and docs

Follow-up from the round-3 re-review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md) §Re-review (round 3)). Findings: P-1 … P-6 — read each row there.

## Definition of Done

A malformed stored proposal falls back to the stored invoice (integration case); the AC-19 eval row triggers SEVERAL_ACCOUNTS_IN_CURRENCY and the follow-up picks a non-default account; slot tests pin one copy per slot; a bad topic still rejects; the migration test asserts McpDraftRepeat.proposal after deploy and re-up with a correct title; data-model says 01_*…11_*.

Gate: unit + integration + lint + typecheck clean. Trailers `SDD-Task: T45`, `SDD-AC` per AC, `SDD-Review: P-x` per finding.
