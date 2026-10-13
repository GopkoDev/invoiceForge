---
id: T57
title: "Run the form path in the chat route: refuse before counting, compose the message, pin and resolve in code, origin FORM"
layer: "ports"
deps: ["T56"]
blocks: ["T58", "T60"]
acs: ["AC-08", "AC-10", "AC-11", "AC-12b", "AC-38"]
files_hint: ["app/api/chat/route.ts", "lib/ai/run-turn.ts", "lib/services/conversations/"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "done"
---

# T57 — Run the form path in the chat route: refuse before counting, compose the message, pin and resolve in code, origin FORM

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T56 — Check a sent form before any count and claim or release it with the allowance slot · **Blocks:** T58 — Prove the form safety properties: injection and forged-id fixtures, uniform refusals, concurrent sends, release, spans, T60 — Wire QuestionForm into the chat island, send forms, remove OfferedChoices · **Wave:** 7 (longest dependency chain inside T50+).
- **Lane:** shares `lib/ai/run-turn.ts`, `lib/services/conversations/` with T51, T55, T63 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It is the one request path a Send takes, end to end.

## Inlined context

> body → `checkForm` → reserve the slot and claim the row with `answers` (one transaction) → compose the message text … → `form-pin` into the stored request → if it passes `draftRequestSchema`, resolve in code and give the turn the prior `propose_draft` step (T01 seam); otherwise give the turn a prior `ask_user` step holding the answers as data → agent turn → `saveTurn` (origin `FORM`; closes another tab's open form; stores the next form). A system-side failure releases the slot and the claim (answers cleared).
>
> — `sad.md §5 «Revision 2026-10-13», Submit order, verbatim` · full text: [sad.md](../sad.md)

> **F6.** An answer that names a record is put into the draft by the system as exactly that record … A typed "Other…" answer for a record or a currency is treated as the Freelancer's own words … Typed answers are checked for form before sending, per kind: a quantity or a price is a number greater than 0 with at most 2 decimals and at most 8 digits before the point; a tax rate 0–100, ≤ 2 decimals; a discount ≥ 0, ≤ 2 decimals; a date is a real calendar day, and a due date typed in the same form as an issue date is not before it; PO number ≤ 100, payment terms ≤ 200, notes ≤ 2,000, a free answer ≤ 500, a typed record name ≤ 200 … On Send the system applies all draft answers to that stored request and runs the draft action itself; the chat is still called once … Options do not change while the form is filled.
>
> — `spec.md §1, F6, abridged` · full text: [spec.md](../spec.md)

> **Hard rule (owner, 2026-10-13):** existing AC tests stay green and are never weakened; a test of a superseded AC is rewritten for the new behaviour, never deleted silently.
>
> — `tasks/_epic.md §Decisions, D-15, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `ChoiceOffer.kind` | `ChoiceOfferKind` | NOT NULL | adds `FORM` |
| `ChoiceOffer.request` | JSONB | NULL (was NOT NULL) | altered |
| `ChoiceOffer.questions` | JSONB | NULL | added |
| `ChoiceOffer.answers` | JSONB | NULL | added |
| `ConversationMessage.origin` | `MessageOrigin` | NULL | adds `FORM` |

— `data-model.md §Revision 2026-10-13, ChoiceOffer + ConversationMessage.origin, abridged` · full text: [data-model.md](../data-model.md)

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

### AC-10 — domain invariant

> **Given** Customers "Acme Corp" and "Аcme Corp" (the second with a Cyrillic "А"), offered as two options of a Customer question
> **When** the Freelancer picks the second option and presses Send
> **Then** each option also shows its Customer's email so the two can be told apart, and the draft continues with exactly the Customer they picked, never the look-alike one
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

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

### AC-38 — happy path

> **Given** a reply whose form asks for the Customer (offering Acme Corp and Acme GmbH and "Other…") and for the price of line 1
> **When** the Freelancer chooses "Other…", types "Оohn  Doe" (a saved Customer, with a Cyrillic "О"), types "40" as the price, and presses Send
> **Then** the Customer is matched from their typed words like a typed message and the draft card shows "Оohn  Doe" at 40.00; had they typed "forty" or "-5" as the price, the form would have shown under that question that a positive amount is needed, Send would have stayed disabled, and nothing would have been sent or counted
>
> — `spec.md §5, AC-38, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] replace the press branch of `app/api/chat/route.ts` with the form branch (409 / 400 bodies verbatim)
- [ ] prior `ask_user` step builder in `run-turn.ts` (data only) beside the pinned `propose_draft` step
- [ ] save the composed text with origin FORM; ignore `message.parts[0].text`
- [ ] rewrite the T14 press-path route tests for forms (same files, renamed)

## Edge cases

| Case | Behaviour |
|---|---|
| free-question form | no draft action; answers reach the model as data |
| mixed form | draft answers pinned, free answers in the message |
| provider failure after claim | slot and claim released, answers cleared |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] route integration tests with the scripted model pass (call counts asserted)
- [ ] rewritten T14 tests pass
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T57`
