---
id: T44
title: "Align the AI workspace with SCR-01/SCR-02: list row after save, conversation-only below lg, keyboard order, delete-all count, design-system rows"
layer: "ui"
deps: ["T40"]
blocks: []
acs: ["AC-01", "AC-11", "AC-35", "AC-37"]
files_hint: ["components/ai/ai-workspace.tsx", "components/ai/conversation-list-client.tsx", "app/(protected)/ai/", "tests/component/ai-layout-reuse-t40.test.tsx", "docs/features/ai-assistant/screens.md", "docs/design-system.md", "tests/e2e/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
origin: "review-2026-10-12 round 2"
---

# T44 — Align the AI workspace with SCR-01/SCR-02: list row after save, conversation-only below lg, keyboard order, delete-all count, design-system rows

Follow-up from the round-2 re-review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md) §Re-review (round 2)). Findings: N-2, N-3, N-7, N-8, N-11 — read each row there and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-01, AC-11, AC-35, AC-37 — verbatim in [spec.md §5](../spec.md); screens in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

The new row heads the list once data-conversation arrives in contract order (after save) and screens.md says so; below lg /ai/{id} shows only the Conversation with "← All conversations"; DOM order matches visual order at every breakpoint; Delete all counts the merged list; docs/design-system.md lists DraftCard cards prop, AiWorkspace and NewConversationProvider.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Trailers `SDD-Task: T44`, one `SDD-AC` per AC, one `SDD-Review: N-x` per finding. Append the resolution line per finding to the review record.
