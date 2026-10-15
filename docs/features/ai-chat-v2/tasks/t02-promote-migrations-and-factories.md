---
id: T02
title: "Promote staged migrations 01–05, apply the Prisma schema edits and extend the test factories"
layer: "migration"
deps: []
blocks: ["T11", "T16"]
acs: ["AC-34"]
files_hint: ["docs/features/ai-chat-v2/migrations/01_create_choice_offer.up.sql", "docs/features/ai-chat-v2/migrations/01_create_choice_offer.down.sql", "docs/features/ai-chat-v2/migrations/02_add_conversation_message_origin.up.sql", "docs/features/ai-chat-v2/migrations/02_add_conversation_message_origin.down.sql", "docs/features/ai-chat-v2/migrations/03_backfill_conversation_message_origin.up.sql", "docs/features/ai-chat-v2/migrations/03_backfill_conversation_message_origin.down.sql", "docs/features/ai-chat-v2/migrations/04_add_conversation_started_from.up.sql", "docs/features/ai-chat-v2/migrations/04_add_conversation_started_from.down.sql", "docs/features/ai-chat-v2/migrations/05_add_invoice_issued_from_chat.up.sql", "docs/features/ai-chat-v2/migrations/05_add_invoice_issued_from_chat.down.sql", "prisma/migrations/", "prisma/schema/ai.prisma", "prisma/schema/auth.prisma", "prisma/schema/invoice.prisma", "tests/support/factories/choice-offer.ts", "tests/support/factories/conversation.ts", "tests/support/factories/invoice.ts", "tests/support/db/truncate.ts", "tests/integration/ai-chat-v2-migrations.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T02 — Promote staged migrations 01–05, apply the Prisma schema edits and extend the test factories

## Place in the sequence

- **Blocked by:** nothing (can start first)
- **Blocks:** T11 — Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen, T16 — Guard updateInvoiceStatus with an optional expectedVersion and set issuedFromChat on that path
- **Wave:** 1 (longest dependency chain); linear position T02 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the privacy page, my data export and account deletion to cover everything the chat stores
> **So that** I can trust what happens to my Conversations, choices and prompts
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

It lands the stored data AC-34 exports and deletes: offers, message origin and Conversation start point.

## Inlined context

> Staged migrations: `docs/features/ai-chat-v2/migrations/01_*` … `05_*` (`.up.sql` + `.down.sql`). They are **not** in the live `prisma/migrations/` tree; `implement` promotes them. SAD §7 says "one Prisma migration"; it is split into five ordinals here so each change rolls back on its own (see the audit). The up bodies match `prisma migrate diff` for §Prisma schema edits, made idempotent.
>
> — `data-model.md §header, Staged migrations, verbatim` · full text: [data-model.md](../data-model.md)

> Promote staged pairs 01–10 in order into `prisma/migrations/<timestamp>_<name>/migration.sql` (the `.down.sql` stays in the staged folder, as earlier features did; the revert test applies it from there)
>
> — `docs/features/ai-assistant/tasks/t01-promote-migrations-and-test-support.md §Checklist, repo precedent, verbatim` · full text: `docs/features/ai-assistant/tasks/t01-promote-migrations-and-test-support.md`

> A throwaway database container per suite with every migration applied (the staged migrations promoted) plus the trace-store schema migration; never the database from the repo's environment files. The model is the scripted model.
>
> — `test-plan.md §Levels, Integration strategy, verbatim` · full text: [test-plan.md](../test-plan.md)

> The staged migrations → expected: forward migrations apply on a database with the first iteration's data. The backfill marks every existing user message as typed and leaves assistant messages empty. Existing Conversations read "AI section". The rollback restores the previous schema. Reading a user message with no origin treats it as typed.
>
> — `test-plan.md §Edge cases, staged migrations, verbatim` · full text: [test-plan.md](../test-plan.md)

> **Hard rule:** rehearse only on a throwaway Postgres container (testcontainers). Never run a migrate, reset or SQL command against the databases in `.env` or `.env.prod`.
>
> — `owner instruction for this feature (memory: DB env files), verbatim` · full text: `owner`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Change | Detail |
|---|---|
| NEW table `ChoiceOffer` | `id` TEXT PK cuid · `userId` FK→User CASCADE · `conversationId` FK→Conversation CASCADE · `messageId` UNIQUE FK→ConversationMessage CASCADE · `kind ChoiceOfferKind` · `lineIndex INT NULL` · `request JSONB` · `options JSONB` · `state ChoiceOfferState DEFAULT 'OPEN'` · `chosenOptionId INT NULL` · `createdAt`/`updatedAt` |
| NEW indexes | `ChoiceOffer_conversationId_open_key` (unique, partial `state = 'OPEN'`), `ChoiceOffer_conversationId_idx`, `ChoiceOffer_messageId_key`, `ChoiceOffer_userId_idx` |
| NEW column `ConversationMessage.origin` | `MessageOrigin NULL` (`TYPED`/`PRESSED`/`DASHBOARD`); backfill `TYPED` on existing USER rows (03) |
| NEW column `Conversation.startedFrom` | `ConversationStartPoint NOT NULL DEFAULT 'AI_SECTION'` |
| NEW column `Invoice.issuedFromChat` | `BOOLEAN NOT NULL DEFAULT false` |
| NEW enums | `ChoiceOfferKind`, `ChoiceOfferState`, `MessageOrigin`, `ConversationStartPoint` |

Staged pairs, promoted in this order: `01_create_choice_offer`, `02_add_conversation_message_origin`, `03_backfill_conversation_message_origin`, `04_add_conversation_started_from`, `05_add_invoice_issued_from_chat` (each `.up.sql` → `prisma/migrations/<timestamp>_<name>/migration.sql`, timestamps after `20261010101000`; `.down.sql` stays staged).

— `data-model.md §Entities + §Indexes + §Prisma schema edits, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-34 — cross-context

> **Given** a Freelancer who used the chat, pressed offered buttons and sent a prompt from the dashboard
> **When** they download their data export, and later delete their account
> **Then** the export includes every Conversation with its messages, the Offered choices and the ones chosen, whether each message was typed, pressed or sent from the dashboard, and where each Conversation was started; deleting the account deletes all of it with the rest of their data
>
> — `spec.md §5, AC-34, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Promote each staged `.up.sql` in order into `prisma/migrations/<timestamp>_<name>/migration.sql` — `prisma/migrations/`
- [ ] Apply the schema edits (four enums, `ChoiceOffer` model with the partial unique `where: { state: "OPEN" }`, `Conversation.startedFrom` + `offers`, `ConversationMessage.origin` + `offer`, `User.choiceOffers`, `Invoice.issuedFromChat`) — `prisma/schema/ai.prisma`, `auth.prisma`, `invoice.prisma`
- [ ] `prisma generate`; on the throwaway container, `prisma migrate diff` between the promoted migrations and the schema shows no drift
- [ ] New factory `createChoiceOffer` (defaults `CUSTOMER`, `OPEN`, options "Acme Corp (billing@acme.example.test)" / "Acme GmbH (no email)"; `request`/`options` built by the production zod schemas once T10 exists — until then typed literals) — `tests/support/factories/choice-offer.ts`
- [ ] `conversation` factory accepts `startedFrom`, per-message `origin` and explicit message `id`; `invoice` factory accepts `issuedFromChat` — `tests/support/factories/`
- [ ] Add `'ChoiceOffer'` to `APP_TABLES` before `'ConversationMessage'` — `tests/support/db/truncate.ts`
- [ ] Integration test (testcontainers): seed first-iteration rows → up 01–05 → backfill check → down 05–01 from the staged files → up again; two `OPEN` offers in one Conversation violate the partial index; `user.delete` leaves 0 `ChoiceOffer` rows — `tests/integration/ai-chat-v2-migrations.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Existing USER message before the backfill | Reads `TYPED` (backfill 03); a NULL USER origin read by code also means `TYPED` |
| Existing ASSISTANT message | `origin` stays NULL |
| Existing Conversation | `startedFrom = 'AI_SECTION'` |
| Re-running an up migration | Idempotent DDL: no error, no second object |
| Docker not running | The suite skips cleanly; never falls back to another database (check `docker info` before reading a red) |

## Definition of Done

- [ ] The five staged pairs are promoted in order into prisma/migrations, apply, backfill and revert cleanly on a throwaway testcontainers Postgres with no Prisma drift, a second OPEN offer in one Conversation fails on the partial unique index, and prisma.user.delete leaves no ChoiceOffer row.
- [ ] staged migrations 01–05 promoted to live `prisma/migrations/`, then apply and revert cleanly on the throwaway container
- [ ] no Prisma drift; `pnpm prisma generate` and typecheck pass
- [ ] the migrations integration test passes (backfill, partial unique, cascade)
- [ ] no command touched the `.env` / `.env.prod` databases
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
