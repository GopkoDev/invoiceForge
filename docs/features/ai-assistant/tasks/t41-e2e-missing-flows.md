---
id: T41
title: "Add the missing test-plan e2e flows (AC-25, AC-34, AC-35) and the SCR-01 / SCR-03 visual baselines"
layer: "tests"
deps: ["T35", "T39", "T40"]
blocks: []
acs: ["AC-25", "AC-34", "AC-35"]
files_hint: ["tests/e2e/ai-assistant.spec.ts", "tests/e2e/support/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
origin: "review-2026-10-12"
---

# T41 — Add the missing test-plan e2e flows (AC-25, AC-34, AC-35) and the SCR-01 / SCR-03 visual baselines

Follow-up task from the independent review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md)). Findings: R-25 — read each finding's row there (file:line, problem, suggested fix) and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-25, AC-34, AC-35 — verbatim text in [spec.md §5](../spec.md); screen states in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

Playwright flows: create a key with Draft permission; no messages left then Create with AI; reopen a past Conversation and continue; visual baselines for SCR-01 default and SCR-03 live and created.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Commit trailers `SDD-Task: T41`, one `SDD-AC` per AC, one `SDD-Review: R-xx` per finding. Append the resolution line per finding to the review record's Resolution log.
