---
id: T61
title: "Cover forms, answers and origin FORM in the data export, account deletion and the privacy page"
layer: "app"
deps: ["T55"]
blocks: []
acs: ["AC-34", "AC-35"]
files_hint: ["lib/services/account/", "constants/public-pages-content.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T61 — Cover forms, answers and origin FORM in the data export, account deletion and the privacy page

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T55 — Compose the turn's one form, stream it, store it in saveTurn and return FormView on reopen · **Blocks:** — · **Wave:** 6 (longest dependency chain inside T50+).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the privacy page, my data export and account deletion to cover everything the chat stores
> **So that** I can trust what happens to my Conversations, choices and prompts
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

It keeps the data notice honest for the new stored data.

## Inlined context

> **Question forms** (2026-10-13): the questions, the offered options' labels … and the answers sent, typed "Other…" text included, stored with the reply and the sent message, kept and deleted with the Conversation, included in the export.
>
> — `spec.md §6.1, Personal data touched, verbatim` · full text: [spec.md](../spec.md)

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

Internal — no API surface.

## Acceptance criteria

### AC-34 — cross-context

> **Given** a Freelancer who used the chat, sent Question forms (with an option picked, an "Other…" text and a price typed) and sent a prompt from the dashboard
> **When** they download their data export, and later delete their account
> **Then** the export includes every Conversation with its messages, every form with its questions, options and the answers sent (typed "Other…" text included), the Offered choices of Conversations saved before the revision and the ones chosen, whether each message was typed, pressed, sent from a form or sent from the dashboard, and where each Conversation was started; deleting the account deletes all of it with the rest of their data
>
> — `spec.md §5, AC-34, verbatim` · full text: [spec.md](../spec.md)

### AC-35 — happy path

> **Given** a Visitor or a Freelancer reading the privacy page
> **When** they read its AI section
> **Then** it says which chat data is stored (Conversations with their messages, draft cards, Question forms with their options and the answers sent including typed text, Offered choices and the ones chosen, prompts sent from the dashboard, where each message and Conversation came from), how long it is kept (90 days after the last message, or until deleted), who processes message text (the model provider through its gateway), and what the sender-profile and product reads share with an AI client connected through a Personal key (bank name, last four digits, currency — never a full account number)
>
> — `spec.md §5, AC-35, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] export: each form with questions, labels and answers (typed text), messages with origin FORM; bump the export version
- [ ] privacy page AI section lists Question forms and their answers
- [ ] integration test for export and deletion; component test for the privacy text

## Edge cases

| Case | Behaviour |
|---|---|
| legacy offer | exported as before plus its backfilled form view |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] tests pass
- [ ] owner reviews the privacy wording before ship (as D-7)
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T61`
