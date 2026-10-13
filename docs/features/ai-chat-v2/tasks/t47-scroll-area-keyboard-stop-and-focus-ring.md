---
id: T47
title: "The conversation scroll area stays a keyboard stop with a visible focus ring (review R17-1)"
layer: "ui"
deps: ["T43"]
blocks: []
acs: ["AC-16"]
files_hint: ["components/ai-elements/conversation.tsx", "tests/component/ai-elements-conversation-message.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T47 — The conversation scroll area stays a keyboard stop with a visible focus ring (review R17-1)

Follow-up task from review 2026-10-13, round 17. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

T43 put `tabIndex=-1` and `outline-none` on the scroll area. As a result, a Conversation of plain-text replies can no longer be reached by Tab to scroll it, and focus after a jump has no visible indicator.

## Definition of Done

- RED first: ConversationContent's scroll area is tabIndex 0, named (role region, aria-label Messages) and shows a focus-visible ring instead of outline-none; a keyboard jump still moves focus to it; component tests written first.
- Gate: unit (only the 8 known env.example failures), lint and typecheck green. Commit with `SDD-Task: T47`.
