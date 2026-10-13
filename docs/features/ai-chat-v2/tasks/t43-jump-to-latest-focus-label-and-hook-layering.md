---
id: T43
title: "Jump to latest shows its label on focus and keeps focus; the follow hook lives with the elements (review R16-2, R16-8)"
layer: "ui"
deps: ["T33"]
blocks: []
acs: ["AC-16"]
files_hint: ["components/ai-elements/conversation.tsx", "components/ai-elements/use-follow-latest.ts", "components/ai/use-follow-latest.ts", "tests/component/ai-elements-conversation-message.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T43 — Jump to latest shows its label on focus and keeps focus; the follow hook lives with the elements (review R16-2, R16-8)

Follow-up task from review 2026-10-13, round 16, which reviewed the presentation rewrite. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

The Jump to latest button only has `aria-label` and `title`, so it shows no label on keyboard focus (screens.md:209 asks for a visible-on-focus label). Pressing it unmounts it, which drops focus to `<body>`. Also, `components/ai-elements/conversation.tsx` imports `@/components/ai/use-follow-latest`, which reverses the ADR-0010 layering.

## Definition of Done

- RED first: ConversationScrollButton has a text label that becomes visible on keyboard focus, and after a jump focus moves to a sensible target instead of body; use-follow-latest lives in components/ai-elements (components/ai re-exports or imports from there) so no element imports from components/ai; the inner column carries data-slot="conversation-column"; component tests written first prove label-on-focus and focus retention.
- Gate: unit (only the 8 known env.example failures), affected integration, lint and typecheck green. Commit with `SDD-Task: T43`.
