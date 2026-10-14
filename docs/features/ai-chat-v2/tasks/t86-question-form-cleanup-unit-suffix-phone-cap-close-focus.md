---
id: T86
title: "QuestionForm: drop the unused sending state, restore the input unit suffix, cap the dock lower on a phone, and focus the Message box after × (consistency C10, C11, C15, C17, C18)"
layer: "ui"
deps: ["T85"]
blocks: []
acs: ["AC-55", "AC-37"]
files_hint: ["components/ai/question-form.tsx", "components/ai/chat-island.tsx", "tests/component/question-form.test.tsx", "tests/component/question-form-in-chat.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T86 — QuestionForm: drop the unused sending state, restore the input unit suffix, cap the dock lower on a phone, and focus the Message box after × (consistency C10, C11, C15, C17, C18)

Follow-up task from the docs/code consistency pass 2026-10-14 (critic + reviewer over ux-flows, screens, spec, contracts vs code). Source: [`_review/consistency-2026-10-14.md`](../_review/consistency-2026-10-14.md).

## Problem

After T84 the chat always passes `pending={false}`; the `pending` / "Sending…" branch of `QuestionForm` is dead. T79 dropped the PRICE/DISCOUNT unit suffix that T74 added, though `FormView.currency` is still sent and an input-only price is ambiguous. On a 360×640 phone an 8-option dock at `max-h-[50dvh]` leaves almost no room for the reply. Pressing × unmounts the focused button and focus falls to <body>.

## Definition of Done

- (1) `QuestionForm` has no `pending` prop, no "Sending…" text, no Loader icon, no `aria-busy` for sending; the in-chat dock no longer needs the blur layout effect (the form renders nothing while its answers are in flight) — remove it, keep the `hidden` wrapper. Remove/replace the two component tests that only exercised `pending` (`question-form.test.tsx` "pending: rows disabled…", "R2 close while sending (T82)"). (2) The typed input of a PRICE question shows the invoice currency (FormView.currency) as a visible suffix and a RATE/DISCOUNT question shows "%"; the suffix is part of the input's accessible description. (3) The dock's scroll area is `max-h-[40dvh]` below `md` and `md:max-h-[50dvh]` above. (4) After × the Message box (composer textarea) has focus. Component tests for (2)–(4) RED first. Gate: unit (incl. component), lint, typecheck.
- Commit with `SDD-Task: T86`.
