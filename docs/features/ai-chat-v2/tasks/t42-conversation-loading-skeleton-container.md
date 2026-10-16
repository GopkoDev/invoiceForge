---
id: T42
title: "Redraw the Conversation page loading skeleton inside the workspace container (review R16-1)"
layer: "ui"
deps: ["T35"]
blocks: []
acs: ["AC-15"]
files_hint: ["app/(protected)/ai/[conversationId]/loading.tsx", "app/(protected)/ai/loading.tsx", "tests/component/ai-conversation-page.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T42 — Redraw the Conversation page loading skeleton inside the workspace container (review R16-1)

Follow-up task from review 2026-10-13, round 16, which reviewed the presentation rewrite. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

The Conversation page's loading boundary still draws the first build's layout: an 18rem grid, `h-14` card rows, no bordered container and no header row. Every switch between Conversations goes through it, so the list width jumps and the border pops in (screens.md SCR-01/SCR-03 `loading`).

## Definition of Done

- RED first: app/(protected)/ai/[conversationId]/loading.tsx renders the same bordered rounded 16rem workspace container and list-pane skeleton as /ai/loading.tsx, plus an h-12 header skeleton, message skeletons in a centred max-w-3xl column and a rounded-2xl composer skeleton; a component test written first proves it.
- Gate: unit (only the 8 known env.example failures), affected integration, lint and typecheck green. Commit with `SDD-Task: T42`.
