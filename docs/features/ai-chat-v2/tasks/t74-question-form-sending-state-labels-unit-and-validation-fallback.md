---
id: T74
title: "QuestionForm: show the sending state, name every input, show the currency unit, and never drop a form 400 silently (review R20-4, R20-6, R20-7, R20-13)"
layer: "ui"
deps: ["T60"]
blocks: []
acs: ["AC-08", "AC-37"]
files_hint: ["components/ai/question-form.tsx", "components/ai/chat-island.tsx", "lib/validations/assistant-chat.ts", "lib/validations/form-answers.ts", "types/assistant/types.ts", "lib/services/assistant-drafts/forms.ts", "tests/component/question-form.test.tsx", "tests/component/question-form-in-chat.test.tsx", "tests/contract/ai-chat-v2-chat-request.contract.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T74 — QuestionForm: show the sending state, name every input, show the currency unit, and never drop a form 400 silently (review R20-4, R20-6, R20-7, R20-13)

Follow-up task from review 2026-10-13, round 20. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

(R20-4) On a form 400 the island (chat-island.tsx:608-615) stores error.body.fieldErrors and returns; QuestionForm reads only `form.answers.<id>` keys, so other keys show nothing. Reachable: an all-optional form sent with nothing picked (`answers: []`, empty message → keys `form.answers`, `message.parts.0.text`), and a Notes answer near 2,000 characters whose composed "Notes: …" exceeds the message text max (assistant-chat.ts:89). (R20-6) During a send `latestReplyId` is null so `isLatest`/`editable` are false (chat-island.tsx:850-852, question-form.tsx:65-66,135-138,314-334): the form shows closed and "Not answered" instead of SCR-04 "sending" (whole form disabled, picks kept, Send shows a Spinner); the Spinner branch is dead and is aria-hidden with role=status. (R20-7) The NOTES/FREE Textarea has no accessible name; the DATE trigger is named only "Pick a date" (question-form.tsx:257-270,285-289). (R20-13) AMOUNT and DISCOUNT inputs never show the unit suffix (SCR-04 revision "[ 40 ] USD", "%" for tax): FormView carries no currency and invoiceCurrency is never passed.

## Definition of Done

- Send stays disabled while the form holds no answer at all (an all-optional form needs at least one answer or Skip); for a `form` request the body schema does not bound or require the client's message text (the server ignores and composes it), so a 2,000-character Notes answer sends; the island falls back to the VALIDATION failure alert when a 400 carries no `form.answers.<n>` key.
- While the sent form's request is in flight the form stays shown as the sent form: picks checked and disabled, inputs disabled, Send shows the Spinner (decorative, no role=status); after the reply it shows as answered.
- Every input has an accessible name: the heading is a label (or aria-labelledby) for Input, Textarea and the date trigger ("Issue date: Pick a date" or equivalent); an axe check in the component test with NOTES/FREE and DATE questions open has no label violation.
- FormView carries the form's resolved invoice currency when known; AMOUNT/DISCOUNT/PRICE inputs show it as a suffix and TAX_RATE shows "%"; contract docs (contracts/server-actions.md / openapi FormView) updated if the shape changes.
- RED first (component + contract tests). Gate: unit, integration, lint, typecheck; affected e2e and the question-form Linux baselines re-checked.
- Commit with `SDD-Task: T74` and one `SDD-AC` trailer per AC.
