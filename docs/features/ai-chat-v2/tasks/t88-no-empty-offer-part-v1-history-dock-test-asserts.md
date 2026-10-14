---
id: T88
title: "Replies with a form add no empty gap, v1 history renders sanely, and dock tests assert the dock itself (consistency C12, C13, C14)"
layer: "ui"
deps: ["T87"]
blocks: []
acs: ["AC-55", "AC-13", "AC-53"]
files_hint: ["components/ai/message-list.tsx", "components/ai/chat-island.tsx", "tests/component/question-form-in-chat.test.tsx", "tests/e2e/ai-chat-v2-chat.spec.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T88 — Replies with a form add no empty gap, v1 history renders sanely, and dock tests assert the dock itself (consistency C12, C13, C14)

Follow-up task from the docs/code consistency pass 2026-10-14 (critic + reviewer over ux-flows, screens, spec, contracts vs code). Source: [`_review/consistency-2026-10-14.md`](../_review/consistency-2026-10-14.md).

## Problem

`message-list.tsx` renders an empty <div> for every `data-offer` part (an extra 8 px gap) and keeps an unused `renderOffer` prop. No component test renders a v1 Conversation (a PRESSED message plus legacy CHOSEN/OPEN offers). Some dock checks are `if (q) expect(q).not.toBeVisible()` and pass trivially. The e2e title at `ai-chat-v2-chat.spec.ts:129` says "read-only" though it asserts the form is gone.

## Definition of Done

- `data-offer` parts render nothing (null) and `renderOffer` + its docstring are gone. A component test renders a ChatIsland with v1 history: a PRESSED user message shows as a plain bubble with its label, a CHOSEN legacy offer renders nothing, a latest OPEN legacy offer docks as a one-question, options-only form; no crash. The `if (q)` checks become unconditional (the dock exists and is hidden/empty). Rename the e2e test title to match what it asserts. RED first for the gap test and the null part. Gate: unit (incl. component), lint, typecheck.
- Commit with `SDD-Task: T88`.
