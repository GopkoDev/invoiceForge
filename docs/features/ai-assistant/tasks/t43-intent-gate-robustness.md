---
id: T43
title: "Make the drafting-intent gate robust: default a missing intent to read, prove isolation with drafting on, test agent-phase SYSTEM faults, evaluate intent"
layer: "app"
deps: ["T38"]
blocks: []
acs: ["AC-06b", "AC-11", "AC-14b", "AC-15", "AC-19", "AC-40"]
files_hint: ["lib/ai/router.ts", "lib/ai/run-turn.ts", "tests/support/ai-stub-model.ts", "tests/integration/api/chat-isolation.test.ts", "tests/unit/lib/ai/", "tests/integration/lib/ai/run-turn.test.ts", "evals/assistant/", "tests/unit/evals/assistant-eval.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
origin: "review-2026-10-12 round 2"
---

# T43 — Make the drafting-intent gate robust: default a missing intent to read, prove isolation with drafting on, test agent-phase SYSTEM faults, evaluate intent

Follow-up from the round-2 re-review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md) §Re-review (round 2)). Findings: N-4, N-5, N-6, N-9 — read each row there and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-06b, AC-11, AC-14b, AC-15, AC-19, AC-40 — verbatim in [spec.md §5](../spec.md); screens in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

A verdict missing or with an invalid intent answers the question with no card instead of failing; the cross-tenant propose_draft cases run with intent draft and assert CUSTOMER_NOT_FOUND; a non-model error thrown in the agent phase ends SYSTEM / COULD_NOT_COMPLETE; the eval sets carry multi-turn drafting follow-ups (AC-14b, AC-19), a MIXED drafting row (AC-06b) and an intent label + score in the topic set.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Trailers `SDD-Task: T43`, one `SDD-AC` per AC, one `SDD-Review: N-x` per finding. Append the resolution line per finding to the review record.
