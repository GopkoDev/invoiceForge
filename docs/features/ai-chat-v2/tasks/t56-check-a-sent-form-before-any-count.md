---
id: T56
title: "Check a sent form before any count and claim or release it with the allowance slot"
layer: "infra"
deps: ["T53", "T55"]
blocks: ["T57"]
acs: ["AC-11", "AC-12b", "AC-13"]
files_hint: ["lib/services/assistant-drafts/forms.ts", "lib/services/assistant-usage/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T56 — Check a sent form before any count and claim or release it with the allowance slot

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T53 — Check typed answers per kind, pin answers into a stored draft request, and compose the answer message, T55 — Compose the turn's one form, stream it, store it in saveTurn and return FormView on reopen · **Blocks:** T57 — Run the form path in the chat route: refuse before counting, compose the message, pin and resolve in code, origin FORM · **Wave:** 6 (longest dependency chain inside T50+).
- **Lane:** shares `lib/services/assistant-drafts/forms.ts` with T51, T52, T54 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It keeps forged, stale or foreign answers away from the model and the allowance.

## Inlined context

> **F7.** When a sent form is not the latest reply's open form, belongs to another Freelancer, names a question or option it does not hold, or names a record that was deleted or no longer fits since the form was shown, nothing is sent to the model, nothing is counted, no answer is marked as chosen, and the chat says "This form is no longer available. Answer the latest questions or type your request." in the same words for every one of these causes.
>
> — `spec.md §1, F7, verbatim` · full text: [spec.md](../spec.md)

> Refused uniformly (`CHOICE_UNAVAILABLE`, the F7 sentence): row not found for the actor, not `OPEN`, a `questionId` or `optionId` it does not hold, a required question missing, a chosen record that no longer exists for the actor or no longer fits its stored ref … Format errors of typed answers … are a `VALIDATION` with per-question field errors; both are uncounted and make no model call.
>
> — `sad.md §5 «Revision 2026-10-13», Form check, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** An invalid press never reaches the model, is never counted, marks nothing, and gets one fixed sentence.
>
> — `tasks/_epic.md §Risks / Hard rules, abridged (sentence revised by spec F7)`

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

### AC-13 — cross-context

> **Given** a past Conversation in which the chat asked a form with a bank account question of three options and a price question, and the Freelancer sent it with a typed price
> **When** they reopen that Conversation days later
> **Then** the form shows the same three options with the sent one marked and the typed price as sent, and cannot be changed; when the reply was the latest one and its form was never sent, it can still be answered, and a Send naming an account deleted since is turned down with the F7 words, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `checkForm(actor, { conversationId, form })` → ok | UNAVAILABLE | INVALID(fieldErrors); span `chat.form-check`, metadata only
- [ ] `claimForm` in the reservation transaction (`OPEN → CHOSEN`, `answers`); `releaseForm` clears answers, `CLOSED` when a newer message exists
- [ ] integration tests per refusal cause; timing ≤ 300 ms p95 over 200 checks with 2,000 Customers

## Edge cases

| Case | Behaviour |
|---|---|
| claim loses a race | unavailable, slot released |
| account currency changed since the form | unavailable |
| no slot left | used up, nothing claimed |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] integration tests pass; the T12 claim/release tests are rewritten for forms
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T56`
