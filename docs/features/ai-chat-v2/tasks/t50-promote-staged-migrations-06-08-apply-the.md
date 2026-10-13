---
id: T50
title: "Promote staged migrations 06–08, apply the Prisma schema edits for the Question form and extend the factories"
layer: "migration"
deps: []
blocks: ["T51"]
acs: ["AC-13", "AC-34"]
files_hint: ["docs/features/ai-chat-v2/migrations/06_add_form_enum_values.up.sql", "docs/features/ai-chat-v2/migrations/07_add_choice_offer_form_columns.up.sql", "docs/features/ai-chat-v2/migrations/08_backfill_choice_offer_questions.up.sql", "prisma/schema/ai.prisma", "prisma/migrations/", "tests/support/factories/choice-offer.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T50 — Promote staged migrations 06–08, apply the Prisma schema edits for the Question form and extend the factories

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** — · **Blocks:** T51 — Add the Question form types and zod schemas, swap choice for form in the chat request, and read legacy offers as one-question forms · **Wave:** 1 (longest dependency chain inside T50+).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It gives the form its storage, and turns pre-revision offers into one-question forms so reopen and export read one shape.

## Inlined context

> **F9a.** Offered choices saved before the revision are shown as forms of one question: a pressed one shows its answer, and the latest reply's unpressed one is answered with Send like any form.
>
> — `spec.md §1, F9a, verbatim` · full text: [spec.md](../spec.md)

> 06 enum values (own file: a value added by ADD VALUE cannot be used in the same transaction) · 07 `questions`, `answers` nullable JSONB, `request` DROP NOT NULL · 08 legacy rows → one-question forms, idempotent (`questions IS NULL`). Promote after `20261013104000_add_invoice_issued_from_chat`, next ≈ `20261013105000_…`.
>
> — `data-model.md §Revision 2026-10-13 «Staged migrations»; _audit/data-model-2026-10-13.md, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** integration and migration tests run only on throwaway containers; `.env` is dev, `.env.prod` is prod — never targeted.
>
> — `tasks/_epic.md §Risks / Hard rules, database safety, verbatim`

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

Staged pairs: `docs/features/ai-chat-v2/migrations/06_add_form_enum_values.{up,down}.sql`, `07_add_choice_offer_form_columns.{up,down}.sql`, `08_backfill_choice_offer_questions.{up,down}.sql`.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-13 — cross-context

> **Given** a past Conversation in which the chat asked a form with a bank account question of three options and a price question, and the Freelancer sent it with a typed price
> **When** they reopen that Conversation days later
> **Then** the form shows the same three options with the sent one marked and the typed price as sent, and cannot be changed; when the reply was the latest one and its form was never sent, it can still be answered, and a Send naming an account deleted since is turned down with the F7 words, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-34 — cross-context

> **Given** a Freelancer who used the chat, sent Question forms (with an option picked, an "Other…" text and a price typed) and sent a prompt from the dashboard
> **When** they download their data export, and later delete their account
> **Then** the export includes every Conversation with its messages, every form with its questions, options and the answers sent (typed "Other…" text included), the Offered choices of Conversations saved before the revision and the ones chosen, whether each message was typed, pressed, sent from a form or sent from the dashboard, and where each Conversation was started; deleting the account deletes all of it with the rest of their data
>
> — `spec.md §5, AC-34, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Promote 06, 07, 08 in order into `prisma/migrations/<timestamp>_<name>/migration.sql` (06 alone in its file); keep the `.down.sql` staged (D-3 precedent)
- [ ] Prisma edits: `ChoiceOfferKind` + `FORM`, `MessageOrigin` + `FORM`, `ChoiceOffer.request Json?`, `questions Json?`, `answers Json?` — `prisma/schema/ai.prisma`
- [ ] `createQuestionForm(prisma, {...})` built through the production schema (stub schema until T51 lands; T51 swaps it) — `tests/support/factories/choice-offer.ts`
- [ ] Integration test on a throwaway container: up → backfill (legacy CHOSEN row gets `answers` [{questionId 0, optionId n}]) → re-run 08 is a no-op → down 08/07/06 → up

## Edge cases

| Case | Behaviour |
|---|---|
| a legacy OPEN row | gets `questions` with one RESOLVER question and `answers` NULL |
| 08 run twice | second run touches 0 rows |
| a FORM row exists during 06.down | deleted (documented lossy down) |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] migrations apply, backfill and revert cleanly on a throwaway Postgres; no command against `.env` / `.env.prod`
- [ ] existing ChoiceOffer integration tests stay green
- [ ] typecheck green after `prisma generate`
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T50`
