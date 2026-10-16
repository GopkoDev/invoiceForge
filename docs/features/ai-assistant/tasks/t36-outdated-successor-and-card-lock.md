---
id: T36
title: "Show an OUTDATED card's successor on reload and lock the Conversation before inserting it"
layer: "app"
deps: ["T20", "T25", "T28"]
blocks: []
acs: ["AC-14b", "AC-18", "AC-35", "AC-36"]
files_hint: ["lib/services/assistant-drafts/cards.ts", "lib/services/conversations/conversations.ts", "components/ai/draft-card.tsx", "tests/integration/services/assistant-drafts/", "tests/integration/services/conversations/conversation-reads.test.ts", "tests/component/draft-card.test.tsx", "docs/features/ai-assistant/contracts/server-actions.md"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
origin: "review-2026-10-12"
---

# T36 — Show an OUTDATED card's successor on reload and lock the Conversation before inserting it

Follow-up task from the independent review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md)). Findings: R-03, R-04 — read each finding's row there (file:line, problem, suggested fix) and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-14b, AC-18, AC-35, AC-36 — verbatim text in [spec.md §5](../spec.md); screen states in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

After an OUTDATED press, reopening the Conversation renders the successor card (with its created/issued/unavailable state) under the collapsed old one and "Go to the newer card" scrolls to it; createFromCard locks the Conversation row (same order as saveTurn) before inserting the successor so a concurrent turn cannot break the one-LIVE-card index.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Commit trailers `SDD-Task: T36`, one `SDD-AC` per AC, one `SDD-Review: R-xx` per finding. Append the resolution line per finding to the review record's Resolution log.
