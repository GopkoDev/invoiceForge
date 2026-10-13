---
id: T58
title: "Prove the form safety properties: injection and forged-id fixtures, uniform refusals, concurrent sends, release, spans"
layer: "tests"
deps: ["T57"]
blocks: []
acs: ["AC-09", "AC-11", "AC-12b"]
files_hint: ["tests/integration/", "tests/contract/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T58 — Prove the form safety properties: injection and forged-id fixtures, uniform refusals, concurrent sends, release, spans

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T57 — Run the form path in the chat route: refuse before counting, compose the message, pin and resolve in code, origin FORM · **Blocks:** — · **Wave:** 8 (longest dependency chain inside T50+).
- **Lane:** shares `tests/contract/`, `tests/integration/` with T64 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It pins the safety guarantees so later changes cannot loosen them.

## Inlined context

> | Question form options | 100 % of options are the Freelancer's own records checked by the system, supported currencies, or system-computed dates, each with the system's label; 0 options or labels from model text | contract test of the stream + the injection fixture + a forged-id fixture (another Freelancer's ids, unknown ids) |
| Refused form answers | 100 % of forged, outdated or foreign answers refused with the same words, 0 counted, 0 model calls | route integration tests per cause |
>
> — `spec.md §6, rows «Question form options», «Refused form answers», verbatim` · full text: [spec.md](../spec.md)

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

### AC-09 — domain invariant

> **Given** a reply asking the Freelancer to choose among accounts, where the model's text names an account that is not among the options the draft action found, and where the chat also tries to offer, by id, a bank account that belongs to another Freelancer
> **When** the reply is shown
> **Then** the form offers only the Freelancer's own records that the system checked, each labelled from the stored record; no option ever comes from the reply's words, no option shows another Freelancer's account, and no label differs from the system's label for that record
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — domain invariant

> **Given** a Freelancer with one message left today and a reply with a Question form of three questions
> **When** they answer all three and press Send, and then answer the form in the chat's next reply and press Send
> **Then** the first Send is sent and counts as exactly one message; the second is not processed, none of its answers is marked as chosen, and the chat says today's allowance is used up and when it renews, exactly as for a typed message
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12b — authorization

> **Given** a Conversation whose latest reply holds a form asking for the Customer among Acme Corp and Acme GmbH
> **When** a message arrives presented as answers to a form, naming a form of an older reply, a question or option the form does not hold, or a Customer of another Freelancer
> **Then** it is never applied and never reaches the model; it does not count toward the allowance, and the chat says "This form is no longer available. Answer the latest questions or type your request." in the same words whether the form was outdated, belongs to another Freelancer or never existed; the draft never moves toward that record
>
> — `spec.md §5, AC-12b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] stream contract test: every FormView label equals the label rule for its record; injection note text never appears as a label
- [ ] per-cause route tests asserting identical body, unchanged allowance row, 0 scripted-model calls, unchanged row
- [ ] two concurrent Sends → exactly one claim and one count
- [ ] spans carry no label, name or text
- [ ] rewrite the T15 press safety suite for forms

## Edge cases

| Case | Behaviour |
|---|---|
| forged foreign form id | same 409 as unknown |
| required answer omitted by a hand-made request | same 409 |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] suite green on a throwaway database
- [ ] no T15 test deleted without its rewritten counterpart
- [ ] lint green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T58`
