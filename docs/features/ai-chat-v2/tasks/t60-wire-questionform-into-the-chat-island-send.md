---
id: T60
title: "Wire QuestionForm into the chat island, send forms, remove OfferedChoices"
layer: "ui"
deps: ["T57", "T59"]
blocks: ["T65", "T68", "T69"]
acs: ["AC-08", "AC-08b", "AC-12", "AC-40"]
files_hint: ["components/ai/chat-island.tsx", "components/ai/message-list.tsx", "components/ai/offered-choices.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T60 — Wire QuestionForm into the chat island, send forms, remove OfferedChoices

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T57 — Run the form path in the chat route: refuse before counting, compose the message, pin and resolve in code, origin FORM, T59 — Build the QuestionForm component with every SCR-04 revision state · **Blocks:** T65 — Extend the evaluation harness with form, card-or-form, link and date checks and the owner-feedback rows, T68 — Add e2e-through-UI tests for forms, Markdown, aligned layout, stable skeletons and list-keeping switches, and retake Linux baselines, T69 — Register QuestionForm, ConversationListProvider and the Markdown MessageResponse in the design system and update ux-flows for the form · **Wave:** 8 (longest dependency chain inside T50+).
- **Lane:** shares `components/ai/chat-island.tsx` with T66 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It connects the form to the route so one Send continues the draft.

## Inlined context

> Sending posts `{ conversationId, message: <composed preview text>, form: { formId, answers } }` (openapi `ChatForm`); the optimistic user bubble shows the composed lines … and is replaced by the saved text on finish.
>
> — `screens.md §SCR-04 (revision 2026-10-13), verbatim` · full text: [screens.md](../screens.md)

> **F8.** Once the Freelancer sends any newer message … earlier forms stay visible, read-only, and show the answers that were sent, if any. Answers chosen but not sent are not saved.
>
> — `spec.md §1, F8, abridged` · full text: [spec.md](../spec.md)

> **Hard rule (owner, 2026-10-13):** existing AC tests stay green and are never weakened; a test of a superseded AC is rewritten for the new behaviour, never deleted silently.
>
> — `tasks/_epic.md §Decisions, D-15, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `POST /api/chat` (`sendChatMessage`, openapi 0.3.0): request `form { formId, answers[] }` (ChatForm, FormAnswer: `{questionId, optionId}` | `{questionId, text}` | `{questionId, skipped: true}`) replaces `choice`; `form` needs a non-null `conversationId`, never with `origin`.
- Errors: `409 CONFLICT` + `details.kind CHOICE_UNAVAILABLE` with "This form is no longer available. Answer the latest questions or type your request."; `400 VALIDATION` with `fieldErrors["form.answers.<questionId>"]`; `429 RATE_LIMITED` (used up, nothing claimed); `503 FAILED`.
- Stream part `data-offer { offerId }` now references a form; the browser reads a `FormView`.

— `contracts/openapi.yaml, operationId sendChatMessage + ChatForm/FormAnswer/FormView, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-08 — happy path

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the reply ends with a Question form whose Customer question offers "Acme Corp" and "Acme GmbH" and an "Other…" choice; after they pick "Acme GmbH" and press Send, their message reads "Customer: Acme GmbH" and the chat continues with a draft card for Acme GmbH
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-08b — happy path

> **Given** a Freelancer with Customers Acme Corp and Acme GmbH, and two USD bank accounts on their default sender profile
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the reply holds one form with two questions, the Customer (Acme Corp, Acme GmbH) and the bank account (the two USD accounts); Send stays disabled until both are answered; after one Send the chat shows a draft card for the chosen Customer with the chosen account, and that Send counted as one message
>
> — `spec.md §5, AC-08b, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** a reply with a Question form, after which the Freelancer sent a newer message — either the form itself or a typed message instead
> **When** they look at the earlier reply
> **Then** its form is visible but cannot be changed or sent, and shows the answers that were sent, if any; a form skipped by a typed message shows no answer
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-40 — domain invariant

> **Given** a reply whose form has three questions, two of them answered
> **When** the Freelancer looks at the form, and then types a message in the message box instead and sends it
> **Then** Send stays disabled while a required question is unanswered; the typed message is sent as a normal typed message, the form becomes read-only with no answer, and the two picked answers are not saved
>
> — `spec.md §5, AC-40, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] render `QuestionForm` for each `data-offer` part; picks held in island state, dropped on a typed send or a Conversation switch
- [ ] send path with `form`; 409 → SCR-03 `choice unavailable` with the new sentence; 400 → field errors; 429 → used-up
- [ ] delete `offered-choices.tsx` and rewrite its component tests as QuestionForm tests (no silent deletion)

## Edge cases

| Case | Behaviour |
|---|---|
| typed message while a form is half filled | sent as TYPED; form closes unanswered |
| reload with picks | picks gone |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] component + island tests pass
- [ ] existing chat-island tests stay green
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T60`
