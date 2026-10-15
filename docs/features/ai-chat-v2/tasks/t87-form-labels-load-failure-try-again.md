---
id: T87
title: "A failed load of a new form's labels shows an error with Try again instead of an endless skeleton (consistency C16)"
layer: "ui"
deps: ["T86"]
blocks: []
acs: ["AC-55"]
files_hint: ["components/ai/chat-island.tsx", "tests/component/question-form-in-chat.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T87 — A failed load of a new form's labels shows an error with Try again instead of an endless skeleton (consistency C16)

Follow-up task from the docs/code consistency pass 2026-10-14 (critic + reviewer over ux-flows, screens, spec, contracts vs code). Source: [`_review/consistency-2026-10-14.md`](../_review/consistency-2026-10-14.md).

## Problem

`chat-island.tsx` swallows a rejected or `success:false` `loadConversationCards`; the dock then shows its Skeleton (`aria-busy`) forever with no way out but a reload.

## Definition of Done

- When loading a just-arrived form's view fails (rejects or returns success:false), the dock shows an inline Alert "Couldn't load the question." with a "Try again" button that re-runs the load; on success the form appears; the composer stays usable throughout. Component test RED first (mock the action to fail once then succeed). Gate: unit (incl. component), lint, typecheck.
- Commit with `SDD-Task: T87`.
