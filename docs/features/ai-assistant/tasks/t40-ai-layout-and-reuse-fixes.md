---
id: T40
title: "Fix the AI section layout and reuse: list column on /ai/{id}, phone order, subtitles, ContentArea, dialog close, link styles"
layer: "ui"
deps: ["T18", "T22", "T23", "T30"]
blocks: []
acs: ["AC-01", "AC-33", "AC-35", "AC-37"]
files_hint: ["app/(protected)/ai/", "components/ai/start-panel.tsx", "components/ai/conversation-header.tsx", "components/ai/use-delete-conversations.ts", "components/ai/chat-link.tsx", "components/ai/draft-card.tsx", "app/(protected)/invoices/layout.tsx", "config/", "tests/component/", "docs/features/ai-assistant/screens.md"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
origin: "review-2026-10-12"
---

# T40 — Fix the AI section layout and reuse: list column on /ai/{id}, phone order, subtitles, ContentArea, dialog close, link styles

Follow-up task from the independent review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md)). Findings: R-20, R-21, R-24, R-26, R-27, R-28 — read each finding's row there (file:line, problem, suggested fix) and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-01, AC-33, AC-35, AC-37 — verbatim text in [spec.md §5](../spec.md); screen states in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

At lg /ai/{id} shows the Conversation list column as SCR-01; below lg /ai stacks the start panel above the list with the Recent conversations heading; start-panel subtitles render verbatim; the section uses ContentArea; the delete dialog closes on FAILED; links use buttonVariants and the start=draft route comes from protectedRoutes; screens.md Registered column updated.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Commit trailers `SDD-Task: T40`, one `SDD-AC` per AC, one `SDD-Review: R-xx` per finding. Append the resolution line per finding to the review record's Resolution log.
