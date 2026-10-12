---
id: T38
title: "Offer no Draft card from stored-text injection and add injection cases to the no-guessing evaluation"
layer: "app"
deps: ["T27", "T29", "T32", "T34"]
blocks: []
acs: ["AC-15"]
files_hint: ["lib/ai/agent.ts", "lib/ai/run-turn.ts", "lib/ai/tools/propose-draft.ts", "evals/assistant/", "tests/integration/api/chat-injection.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
origin: "review-2026-10-12"
---

# T38 — Offer no Draft card from stored-text injection and add injection cases to the no-guessing evaluation

Follow-up task from the independent review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md)). Findings: R-07 — read each finding's row there (file:line, problem, suggested fix) and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-15 — verbatim text in [spec.md §5](../spec.md); screen states in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

Stored-text injection cases are in the no-guessing evaluation set and assert zero cards; a code-level guard keeps propose_draft from producing a card unless the Freelancer's own message carries drafting intent; chat-injection.test.ts asserts no card.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Commit trailers `SDD-Task: T38`, one `SDD-AC` per AC, one `SDD-Review: R-xx` per finding. Append the resolution line per finding to the review record's Resolution log.
