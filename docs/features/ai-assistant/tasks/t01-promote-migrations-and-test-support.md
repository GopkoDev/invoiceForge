---
id: T01
title: "Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables"
layer: "migration"
deps: []
blocks: ["T06", "T08", "T09", "T10", "T14", "T15"]
acs: ["AC-26", "AC-39"]
files_hint: ["docs/features/ai-assistant/migrations/01_create_conversation.up.sql", "docs/features/ai-assistant/migrations/01_create_conversation.down.sql", "docs/features/ai-assistant/migrations/02_create_draft_card.up.sql", "docs/features/ai-assistant/migrations/02_create_draft_card.down.sql", "docs/features/ai-assistant/migrations/03_create_message_allowance_day.up.sql", "docs/features/ai-assistant/migrations/03_create_message_allowance_day.down.sql", "docs/features/ai-assistant/migrations/04_create_assistant_turn.up.sql", "docs/features/ai-assistant/migrations/04_create_assistant_turn.down.sql", "docs/features/ai-assistant/migrations/05_add_personal_key_can_create_drafts.up.sql", "docs/features/ai-assistant/migrations/05_add_personal_key_can_create_drafts.down.sql", "docs/features/ai-assistant/migrations/06_create_personal_key_draft_day.up.sql", "docs/features/ai-assistant/migrations/06_create_personal_key_draft_day.down.sql", "docs/features/ai-assistant/migrations/07_create_mcp_draft_repeat.up.sql", "docs/features/ai-assistant/migrations/07_create_mcp_draft_repeat.down.sql", "docs/features/ai-assistant/migrations/08_add_invoice_assistant_origin.up.sql", "docs/features/ai-assistant/migrations/08_add_invoice_assistant_origin.down.sql", "docs/features/ai-assistant/migrations/09_add_invoice_issued_at.up.sql", "docs/features/ai-assistant/migrations/09_add_invoice_issued_at.down.sql", "docs/features/ai-assistant/migrations/10_create_invoice_assistant_key_id_index.up.sql", "docs/features/ai-assistant/migrations/10_create_invoice_assistant_key_id_index.down.sql", "prisma/schema/ai.prisma", "prisma/schema/auth.prisma", "prisma/schema/invoice.prisma", "tests/support/factories/conversation.ts", "tests/support/factories/draft-card.ts", "tests/support/factories/message-allowance-day.ts", "tests/support/factories/assistant-turn.ts", "tests/support/factories/personal-key-draft-day.ts", "tests/support/factories/personal-key.ts", "tests/support/factories/invoice.ts", "tests/support/db/truncate.ts", "tests/integration/ai-assistant-migrations.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T01 — Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables

## Place in the sequence

- **Blocked by:** nothing — starts in wave 1 · **Blocks:** T06 — Write the Assistant origin once at creation, set issuedAt when an invoice first leaves DRAFT, and expose assistantMark on invoice reads, T08 — Count the Daily message allowance in per-local-day rows: read, reserve with a conditional increment, release on failure, T09 — Set Draft permission only when a Personal key is created and return it from the key list and the key check, T10 — List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice, T14 — Add the four independent AI retention steps to the daily purge cron, T15 — Add Conversations and the AI counters to the data export 2.2 and prove account deletion leaves no AI row · **Wave:** 1 — the schema every service task reads and writes.
- **Lane:** own lane; `layer: migration` is serialized by `implement` regardless.

## Why (user story)

> **As a** Freelancer
> **I want** to create a new Personal key with Draft permission, keep my existing keys read-only, and control how many drafts a key may create per day
> **So that** my own AI client can draft invoices without a leaked key ever flooding my account
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to delete one or all of my Conversations, and to know they are deleted automatically after 90 days
> **So that** my customers' names and amounts do not pile up in a chat history forever
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

This task lays the schema under every AI row and proves the two schema-level promises: pre-release keys stay read-only, and account deletion leaves no AI row behind.

## Inlined context

> **Staged migrations:** `docs/features/ai-assistant/migrations/01_*` … `10_*` (`.up.sql` + `.down.sql`). They are **not** in the live `prisma/migrations/` tree. `implement` promotes them. The SQL body of every up matches `prisma migrate diff` for the schema in §Prisma schema edits, made idempotent.
>
> **Out of scope:** Mastra's own trace tables in the `mastra` schema (ADR-0004). Mastra creates and owns them with `pnpm mastra:migrate` (SAD §7). Prisma does not manage them, and they hold metadata only.
>
> — `data-model.md §Mode, staged migrations + out of scope, verbatim` · full text: [data-model.md](../data-model.md)

> - Idempotent DDL (`IF NOT EXISTS`, `DO $$ … IF NOT EXISTS` for enums and FKs). A `CONCURRENTLY` index on the existing `Invoice` table sits alone in its file, as `20261007100100_create_invoice_bank_account_id_index`.
> - FKs are `ON UPDATE CASCADE`. User-owned rows are `ON DELETE CASCADE`. References that must outlive their target are `SET NULL`.
> - No `CHECK` constraints or triggers. One partial unique index through the `partialIndexes` preview, as `SenderProfile_userId_isDefault_key` (invoice-integrity ADR-0005).
>
> — `data-model.md §Conventions followed, abridged` · full text: [data-model.md](../data-model.md)

> The account-deletion transaction (`lib/services/account/account.ts`) needs no new statement. It deletes invoices first (SET NULL on cards, repeat marks and nothing else), then the user, and every new row cascades from `User` or `PersonalKey`. Verified: 0 AI rows left after running the same two deletes. The integration test for account deletion should still assert it.
>
> — `data-model.md §Prisma schema edits, closing paragraph, verbatim` · full text: [data-model.md](../data-model.md)

> - `createConversation(prisma, { userId, messages?, lastMessageAt? })`. Messages get positions 0…n. The default `title` is `'Test conversation <n>'`, and `lastMessageAt` defaults to the test clock's now. AC-38 fixtures pass `lastMessageAt` = 90 days + 1 hour ago.
> - `createDraftCard(prisma, { userId, conversationId, state?, request?, proposal?, invoiceId? })`. The default is a `LIVE` card for a 20 × 50.00 USD line. `request` and `proposal` are built by the same zod schemas as production, so a fixture can never drift from the real shape.
> - `createMessageAllowanceDay(prisma, { userId, day?, used?, timeZone? })`. The AC-09 and AC-10b fixtures use `used: 18` and `used: 29`.
> - `createAssistantTurn(prisma, overrides)`. It has metadata only by construction.
> - `createPersonalKeyDraftDay(prisma, { personalKeyId, created?, allowance? })`. AC-27 and AC-28 use `created: 50`.
> - `createPersonalKey` (existing) accepts `canCreateDrafts`. `createInvoice` (existing) accepts `assistantOrigin`, `assistantKeyName`, `assistantKeyId` and `issuedAt`.
> - Add `'McpDraftRepeat'`, `'PersonalKeyDraftDay'`, `'AssistantTurn'`, `'DraftCard'`, `'ConversationMessage'`, `'Conversation'` and `'MessageAllowanceDay'` to `APP_TABLES` in `tests/support/db/truncate.ts`, before `'Invoice'`, `'PersonalKey'` and `'User'`.
> - **PII guard:** users stay `user-<n>@example.test`, Customers `Acme Corp` / `Acme GmbH` / `Test Customer`, keys `Test key <n>`. Message text in fixtures is the spec's own example wording, never copied from real data.
>
> — `data-model.md §Test fixtures, abridged` · full text: [data-model.md](../data-model.md)

**Note:** `createDraftCard` builds `request` / `proposal` through the zod schemas of T03; T03 is not a dependency here, so until T03 lands the factory takes plain objects typed as `Prisma.InputJsonValue`, and T03 switches it to the schemas (one line).

**Fallback:** insufficient or contradicted by the code → read the named file in full ([data-model.md](../data-model.md) · [sad.md](../sad.md)) and follow it. Do not guess.

## Data delta

Ten staged pairs, promoted in order into `prisma/migrations/` (timestamped names, as the repo does), each with its schema edit:

| Ordinal | Staged pair | Change |
|---|---|---|
| 01 | `migrations/01_create_conversation.{up,down}.sql` | `Conversation`, `ConversationMessage`, enum `ConversationMessageRole` |
| 02 | `migrations/02_create_draft_card.{up,down}.sql` | `DraftCard`, enum `DraftCardState`, partial unique `DraftCard_conversationId_live_key` (`WHERE state = 'LIVE'`) |
| 03 | `migrations/03_create_message_allowance_day.{up,down}.sql` | `MessageAllowanceDay` (`@@id([userId, day])`, `@@index([day])`) |
| 04 | `migrations/04_create_assistant_turn.{up,down}.sql` | `AssistantTurn`, enums `AssistantTopic`, `AssistantTurnOutcome`; `costUsd DECIMAL(10,6)` |
| 05 | `migrations/05_add_personal_key_can_create_drafts.{up,down}.sql` | `PersonalKey.canCreateDrafts BOOLEAN NOT NULL DEFAULT false` |
| 06 | `migrations/06_create_personal_key_draft_day.{up,down}.sql` | `PersonalKeyDraftDay` (`created` default 0, `allowance` default 50, `lastLiftedAt`) |
| 07 | `migrations/07_create_mcp_draft_repeat.{up,down}.sql` | `McpDraftRepeat` (`@@id([personalKeyId, repeatKey])`, `invoiceId` SET NULL) |
| 08 | `migrations/08_add_invoice_assistant_origin.{up,down}.sql` | enum `AssistantOrigin`; `Invoice.assistantOrigin`, `assistantKeyName`, `assistantKeyId` (FK SET NULL) |
| 09 | `migrations/09_add_invoice_issued_at.{up,down}.sql` | `Invoice.issuedAt TIMESTAMP(3) NULL`, no backfill |
| 10 | `migrations/10_create_invoice_assistant_key_id_index.{up,down}.sql` | `Invoice_assistantKeyId_idx`, `CONCURRENTLY`, alone in its file |

Prisma edits: new `prisma/schema/ai.prisma` (01–04, copy verbatim from data-model §Prisma schema edits); `auth.prisma` User back-relations, `PersonalKey.canCreateDrafts` + back-relations, `PersonalKeyDraftDay`, `McpDraftRepeat`; `invoice.prisma` enum `AssistantOrigin`, the four columns, relations and `@@index([assistantKeyId])`.

— `data-model.md §ER diagram + §Entities + §Prisma schema edits, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-26 — domain invariant

> **Given** a Personal key created without Draft permission, including every key that existed before this release
> **When** the Freelancer looks for a way to give it Draft permission
> **Then** there is none; the page explains that drafting needs a new key with Draft permission, which they can create and then revoke the old key
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

### AC-39 — cross-context

> **Given** a Freelancer with Conversations
> **When** they download their data export, and later delete their account
> **Then** the export includes their Conversations, and deleting the account deletes every Conversation along with the rest of their data
>
> — `spec.md §5, AC-39, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Promote staged pairs 01–10 in order into `prisma/migrations/<timestamp>_<name>/migration.sql` (the `.down.sql` stays in the staged folder, as earlier features did; the revert test applies it from there) — `docs/features/ai-assistant/migrations/*`
- [ ] Add `prisma/schema/ai.prisma` and the `auth.prisma` / `invoice.prisma` edits verbatim from data-model §Prisma schema edits
- [ ] `pnpm prisma migrate dev --create-only` / `migrate diff` shows no drift against the promoted SQL
- [ ] Factories: `conversation.ts`, `draft-card.ts`, `message-allowance-day.ts`, `assistant-turn.ts`, `personal-key-draft-day.ts`; extend `personal-key.ts` (`canCreateDrafts`) and `invoice.ts` (origin columns, `issuedAt`) — `tests/support/factories/`
- [ ] Add the seven tables to `APP_TABLES` before `Invoice`, `PersonalKey`, `User` — `tests/support/db/truncate.ts`
- [ ] Integration test: up → down → up on a throwaway Postgres; a key created before 05 reads `canCreateDrafts = false`; a second `LIVE` card in one Conversation fails with a unique violation; `user.delete` (after its invoices) leaves 0 AI rows — `tests/integration/ai-assistant-migrations.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Migration re-run on a database that already has the objects | no error (idempotent DDL) |
| Existing `PersonalKey` rows | `canCreateDrafts = false` after 05 (AC-26) |
| Existing invoices | `issuedAt`, origin columns stay NULL — no backfill |
| Second `LIVE` card in one Conversation | unique violation on `DraftCard_conversationId_live_key` |
| Invoice deleted | `DraftCard.invoiceId`, `McpDraftRepeat.invoiceId` set NULL; card and mark rows stay |
| Conversation deleted | messages and cards cascade; `AssistantTurn.conversationId` set NULL |
| 10 run inside a transaction | not allowed — `CONCURRENTLY` must sit alone, outside a transaction |

## Definition of Done

- [ ] The ten staged pairs are promoted into prisma/migrations, apply and revert cleanly on a throwaway database with no Prisma drift, every pre-existing PersonalKey reads canCreateDrafts = false, and an integration test shows prisma.user.delete leaves no Conversation, ConversationMessage, DraftCard, MessageAllowanceDay, AssistantTurn, PersonalKeyDraftDay or McpDraftRepeat row.
- [ ] staged migrations 01–10 promoted to live `prisma/migrations/`, then apply and revert cleanly
- [ ] factories build `request`/`proposal` without a hand-written shape that can drift
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
