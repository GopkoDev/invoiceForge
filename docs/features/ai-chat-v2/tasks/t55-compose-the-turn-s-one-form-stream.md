---
id: T55
title: "Compose the turn's one form, stream it, store it in saveTurn and return FormView on reopen"
layer: "app"
deps: ["T52", "T54"]
blocks: ["T56", "T61"]
acs: ["AC-08b", "AC-12", "AC-13", "AC-37", "AC-41"]
files_hint: ["lib/ai/turn-context.ts", "lib/ai/run-turn.ts", "lib/ai/tools/propose-draft.ts", "lib/services/conversations/", "lib/actions/assistant-actions.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "done"
---

# T55 — Compose the turn's one form, stream it, store it in saveTurn and return FormView on reopen

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T52 — Build the form from resolver issues and compose one form per reply (order, cap 6, dedupe, input-only above 8, date options), T54 — Add the chat-only ask_user tool that checks every named record owner-scoped and by kind and builds the labels · **Blocks:** T56 — Check a sent form before any count and claim or release it with the allowance slot, T61 — Cover forms, answers and origin FORM in the data export, account deletion and the privacy page · **Wave:** 5 (longest dependency chain inside T50+).
- **Lane:** shares `lib/ai/run-turn.ts`, `lib/services/conversations/` with T51, T57, T63 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It makes every drafting reply end in at most one stored, reopenable form.

## Inlined context

> **F1.** One Question form per reply … up to 6 questions shown together … answered with one **Send**. A reply has at most one form. A reply with a draft card has no form. When more than 6 questions are open, the form keeps the first 6 in this order — Customer, sender profile, bank account, currency, products (by line), issue date, due date, quantities and prices (by line), the other values, free questions — and the rest are asked in the next form after Send.
>
> — `spec.md §1, F1, abridged` · full text: [spec.md](../spec.md)

> **F8.** Once the Freelancer sends any newer message … earlier forms stay visible, read-only, and show the answers that were sent, if any. Answers chosen but not sent are not saved.
>
> — `spec.md §1, F8, abridged` · full text: [spec.md](../spec.md)

> `ChoiceOffer` keeps its owner, Conversation, reply, `state` (`OPEN` → `CHOSEN` = answered → or `CLOSED`), its partial unique index and its cascade. New rows have `kind = FORM`, `questions` …, `request` (the stored draft request, or NULL for a free-question form) and, once answered, `answers`.
>
> — `sad.md §5 «Revision 2026-10-13», The row, abridged` · full text: [sad.md](../sad.md)

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

- `getConversation` / `loadConversationCards` return `forms: Record<string, FormView>` instead of `offers`.

— `contracts/server-actions.md §Revision 2026-10-13, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

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

### AC-13 — cross-context

> **Given** a past Conversation in which the chat asked a form with a bank account question of three options and a price question, and the Freelancer sent it with a typed price
> **When** they reopen that Conversation days later
> **Then** the form shows the same three options with the sent one marked and the typed price as sent, and cannot be changed; when the reply was the latest one and its form was never sent, it can still be answered, and a Send naming an account deleted since is turned down with the F7 words, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-37 — happy path

> **Given** a Freelancer with four Customers, one sender profile, and no catalogue product "web dev"
> **When** they write "invoice web dev 10 hours, but show me the list of Customers"
> **Then** the reply lists the four Customers and ends with one Question form: a Customer question offering the four Customers and "Other…", and a "Line 1 · Price" question with an input only; it asks nothing it can fill itself (the only sender profile, its default account, today as the issue date) and holds no question in prose. After they answer both and press Send, one message is counted, it shows one line per answer, and the chat shows a draft card with those values
>
> — `spec.md §5, AC-37, verbatim` · full text: [spec.md](../spec.md)

### AC-41 — domain invariant

> **Given** a drafting request for which the draft action finds a draft card
> **When** the reply is shown
> **Then** it shows the draft card and no Question form; and a reply never holds more than one form
>
> — `spec.md §5, AC-41, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `pending.form` replaces `pending.offer` in the turn context; propose_draft ISSUES → resolver questions; ask_user → chat questions; end of turn → `composeForm`; card wins; refused ask_user with no valid form → fallback form
- [ ] `data-offer` part streamed once per reply with the form id
- [ ] `saveTurn`: closes the open form, stores the new one (`kind FORM`, `questions`, `request`)
- [ ] reopen projections return `FormView` (legacy rows via T51 mapping)
- [ ] rewrite the T11/T13 offer tests for forms

## Edge cases

| Case | Behaviour |
|---|---|
| card + ask_user in one turn | card only, no form row |
| two ask_user calls | one form (last valid call) |
| free-question form | `request` NULL |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] integration tests (scripted model) pass for each edge
- [ ] rewritten T11/T13 tests pass
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T55`
