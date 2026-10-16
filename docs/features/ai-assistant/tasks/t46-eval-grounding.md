---
id: T46
title: "Ground no-guessing eval values against the whole Freelancer conversation and match names the way the resolver does"
layer: "tests"
deps: ["T45"]
blocks: []
acs: ["AC-12", "AC-14b", "AC-16", "AC-19"]
files_hint: ["evals/assistant/run.ts", "evals/assistant/score.ts", "tests/unit/evals/assistant-eval.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
origin: "review-2026-10-12 round 4"
---

# T46 — Ground no-guessing eval values against the whole Freelancer conversation and match names the way the resolver does

Follow-up from the round-4 re-review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md) §Re-review (round 4)), finding Q-1.

## Definition of Done

findUngroundedValues grounds against item.text plus the user turns of item.history and matches the customer as the resolver does (written name contained in the stored name); unit tests cover the AC-19 follow-up, AC-14b follow-up and AC-12 single-turn cases (no false ungrounded values) and a genuinely invented value (still flagged).

Gate: unit + lint + typecheck clean. Trailers `SDD-Task: T46`, `SDD-AC` per AC, `SDD-Review: Q-1`.
