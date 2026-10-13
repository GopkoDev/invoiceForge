---
id: T51
title: "Add the Question form types and zod schemas, swap choice for form in the chat request, and read legacy offers as one-question forms"
layer: "domain"
deps: ["T50"]
blocks: ["T52", "T53", "T59"]
acs: ["AC-08", "AC-12b", "AC-13"]
files_hint: ["types/assistant/types.ts", "lib/services/assistant-drafts/forms.ts", "lib/services/assistant-drafts/offers.ts", "lib/validations/assistant-chat.ts", "lib/services/conversations/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T51 — Add the Question form types and zod schemas, swap choice for form in the chat request, and read legacy offers as one-question forms

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T50 — Promote staged migrations 06–08, apply the Prisma schema edits for the Question form and extend the factories · **Blocks:** T52 — Build the form from resolver issues and compose one form per reply (order, cap 6, dedupe, input-only above 8, date options), T53 — Check typed answers per kind, pin answers into a stored draft request, and compose the answer message, T59 — Build the QuestionForm component with every SCR-04 revision state · **Wave:** 2 (longest dependency chain inside T50+).
- **Lane:** shares `lib/services/assistant-drafts/forms.ts`, `lib/services/conversations/` with T52, T54, T55, T56, T57 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It fixes one typed shape for questions, answers and the browser view, so every later task builds against the contract.

## Inlined context

> **F5.** Send is enabled once every required question has an answer. Sending submits all answers as one Freelancer message that counts once toward the Daily message allowance and is refused when the allowance is used up … The message shows one line per answered question, "heading: answer", built by the system from the stored labels and the Freelancer's own typed answers, never from text sent by the browser. Its origin is saved as sent from a form.
>
> — `spec.md §1, F5, abridged` · full text: [spec.md](../spec.md)

> Each frozen question holds `questionId` (position), `field` (closed enum), `lineIndex`, `heading` (app text per field), `prompt` (model text, plain, ≤ 140), `options` (0–8 `{ optionId, label, ref }`), `input` (`NONE` | `TEXT` | `AMOUNT` | `RATE` | `DATE`), `required`, `skippable`, `matchCount` and `source` (`RESOLVER` | `CHAT` | `FALLBACK`). A `ref` is a record id, a currency code, an absolute `date`, or `daysAfterIssue` (7, 14, 30).
>
> — `sad.md §5 «Revision 2026-10-13», Questions, verbatim` · full text: [sad.md](../sad.md)

> The chat request carries `form: { formId, answers[] }` … instead of the removed `choice`.
>
> — `adr/0011, Decision outcome «Submit», abridged` · full text: [ADR-0011](../adr/0011-ask-every-open-question-in-one-server-checked-question-form-answered-with-one-send.md)

> **Hard rule (owner, 2026-10-13):** existing AC tests stay green and are never weakened; a test of a superseded AC is rewritten for the new behaviour, never deleted silently.
>
> — `tasks/_epic.md §Decisions, D-15, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. (reads the columns T50 added).

## API contract

- `POST /api/chat` (`sendChatMessage`, openapi 0.3.0): request `form { formId, answers[] }` (ChatForm, FormAnswer: `{questionId, optionId}` | `{questionId, text}` | `{questionId, skipped: true}`) replaces `choice`; `form` needs a non-null `conversationId`, never with `origin`.
- Errors: `409 CONFLICT` + `details.kind CHOICE_UNAVAILABLE` with "This form is no longer available. Answer the latest questions or type your request."; `400 VALIDATION` with `fieldErrors["form.answers.<questionId>"]`; `429 RATE_LIMITED` (used up, nothing claimed); `503 FAILED`.
- Stream part `data-offer { offerId }` now references a form; the browser reads a `FormView`.

— `contracts/openapi.yaml, operationId sendChatMessage + ChatForm/FormAnswer/FormView, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)
- `FormInput` in openapi also lists `DISCOUNT`; keep the zod enum identical to openapi.

## Acceptance criteria

### AC-08 — happy path

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the reply ends with a Question form whose Customer question offers "Acme Corp" and "Acme GmbH" and an "Other…" choice; after they pick "Acme GmbH" and press Send, their message reads "Customer: Acme GmbH" and the chat continues with a draft card for Acme GmbH
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

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

- [ ] `FormField`, `FormInput`, `StoredFormQuestion`, `FormAnswer`, `FormView`, `MessageOrigin` + `FORM` — `types/assistant/types.ts`
- [ ] zod `formQuestionSchema`, `formAnswersSchema` (≤ 6, one answer per question) — `lib/services/assistant-drafts/forms.ts`
- [ ] `chatRequestSchema`: `form` (needs conversationId, not with origin), `choice` removed (strict schema refuses it) — `lib/validations/assistant-chat.ts`
- [ ] legacy reader: `offerRowToFormView` for rows of a non-FORM kind (backfilled questions) — `offers.ts`
- [ ] every exhaustive switch over `MessageOrigin` and `ChoiceOfferKind` handles the new members (export labels included)
- [ ] rewrite the T14 request-schema tests for `form` (no deletion)

## Edge cases

| Case | Behaviour |
|---|---|
| `choice` in a request | 400 VALIDATION (unknown key) |
| `form` with `conversationId: null` | 400 keyed `form` |
| two answers for one questionId | 400 VALIDATION |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] unit tests for the schemas and the legacy mapping pass
- [ ] the rewritten request-schema tests pass
- [ ] typecheck, lint green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T51`
