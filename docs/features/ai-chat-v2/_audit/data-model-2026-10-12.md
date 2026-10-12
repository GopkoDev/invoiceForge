# Audit — data-model — ai-chat-v2 — 2026-10-12

**Mode:** brownfield delta · **Size / route:** L / full (from `.size` / `.route`) · **target_surfaces:** `[backend-service, web-frontend]`

> **The migrations are staged. They are not in the live `prisma/migrations/` tree yet; `implement` promotes them.**

Run autonomously (owner unavailable); every decision is logged below and open to owner veto.

## Staged migrations

| Ordinal | Files | Kind | Promote with |
|---|---|---|---|
| 01 | `docs/features/ai-chat-v2/migrations/01_create_choice_offer.{up,down}.sql` | two new enums + new table + partial unique index + 3 FKs | the offers task (ADR-0001/0002) |
| 02 | `…/02_add_conversation_message_origin.{up,down}.sql` | new enum + nullable column on `ConversationMessage` (catalog-only) | the message-origin task |
| 03 | `…/03_backfill_conversation_message_origin.{up,down}.sql` | data backfill `USER` rows → `TYPED` (idempotent; down is intentionally empty) | right after 02; may be re-run after the code deploy |
| 04 | `…/04_add_conversation_started_from.{up,down}.sql` | new enum + `NOT NULL DEFAULT 'AI_SECTION'` column (catalog-only, PG 11+) | the start-point task |
| 05 | `…/05_add_invoice_issued_from_chat.{up,down}.sql` | `BOOLEAN NOT NULL DEFAULT false` on `Invoice` (catalog-only) | the issue-from-preview task (ADR-0007) |

**Promote-time convention hint.**
- The repo uses `prisma migrate` with timestamped folders `YYYYMMDDhhmmss_snake_case/migration.sql`. The latest live folder is `20261010101000_add_mcp_draft_repeat_proposal`, so the next ≈ `202610xx…_create_choice_offer`. `implement` assigns the real timestamps at promotion, in ordinal order, because another feature may promote first.
- SAD §7 speaks of "one Prisma migration"; it is split into five so each change has its own rollback and the backfill is reviewable on its own. Promoting 01, 02, 04, 05 as one folder is also valid (no `CONCURRENTLY` statement anywhere, so no single-statement rule applies); 03 must follow 02.
- Prisma has no down step: each `.down.sql` is the rollback runbook (`prisma db execute --file … && prisma migrate resolve --rolled-back <name>`), run in reverse order (05 → 01).
- Every up is backward-compatible with the previous build (new table, nullable or constant-default columns), so the release order is `migrate deploy` → code deploy.
- Every DB command targets a host checked first: `.env` = dev, `.env.prod` = prod.

## Verification performed

- `prisma format` + `prisma validate` pass on an edited copy of `prisma/schema` (scratchpad, offline).
- `prisma migrate diff --from-schema prisma/schema --to-schema <edited copy> --script` (offline, schema-to-schema, no database) emits exactly the CREATE TYPE / ALTER TABLE / CREATE TABLE / INDEX / FK statements of 01, 02, 04 and 05 before they were made idempotent, including `CREATE UNIQUE INDEX "ChoiceOffer_conversationId_open_key" … WHERE ("state" = 'OPEN')`.
- **Not performed (by instruction for this stage: no command against any database):** `migrate status` / DB-vs-schema drift on dev, and the throwaway-container rehearsal the ai-assistant audit ran. `implement` should rehearse the promotion on a throwaway PostgreSQL 16 container (apply all live + promoted migrations, then `migrate diff` DB → schema must be empty; check the second-`OPEN`-offer insert is refused and that claim / release / close keep one open row).

## Drift

- **Domain layer vs DDL:** the domain types are Prisma-generated; no hand-written structs map to the touched tables. The touched live models (`Conversation`, `ConversationMessage`, `DraftCard`, `Invoice`) match their live migrations (`20261010100000_create_conversation`, `20261010100100_create_draft_card`, `20261007100000_add_invoice_version`, `20261010100700_add_invoice_assistant_origin`, `20261010100800_add_invoice_issued_at`) by inspection, and the offline schema-to-schema diff shows only this feature's delta.
- **DB vs schema:** not checked (no DB access in this stage). No `_drift/` files.

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches the repo | PASS — PascalCase tables, camelCase columns, Prisma default `_pkey`/`_key`/`_idx`/`_fkey` names; partial index named like `DraftCard_conversationId_live_key` |
| Down reversibility | PASS — 01 drops table + 2 types; 02 drops column + type; 04 drops column + type; 05 drops column; 03 is a data-only backfill whose down is intentionally empty (02.down removes the column) |
| FK indexes | PASS — `userId` → `ChoiceOffer_userId_idx`; `conversationId` → `ChoiceOffer_conversationId_idx`; `messageId` → `ChoiceOffer_messageId_key` |
| Convention adherence | PASS — no `CHECK`/trigger (repo uses none), cuid TEXT ids, JSONB as in `DraftCard`, `createdAt`/`updatedAt` on a stateful model, cascade FKs. Only divergence: SAD §7's "one migration" split into five ordinals (above) |

## Breaking-change decompositions

None needed. No rename, drop or new `NOT NULL` without a constant default. `ConversationMessage.origin` stays nullable, so 02 + 03 is expand + backfill with no contract step.

## Decision log (autonomous)

| # | Question | Choice | Why |
|---|---|---|---|
| 1 | Aggregate roots | `Conversation` owns `ChoiceOffer` (plus `userId` owner column) | Same shape as `DraftCard` (ai-assistant ADR-0007, this ADR-0001); cascades give purge/deletion for free (SAD §7) |
| 2 | Version column for `expectedVersion` | Reuse existing `Invoice.version` | Already exists (invoice-integrity ADR-0004), bumped by every service write; ADR-0007 relies on it |
| 3 | How the offer ties to its reply | `messageId` NOT NULL UNIQUE FK → `ConversationMessage`, cascade | ADR-0001 "tied to the reply"; one choice per reply (SAD §5); the reply id is pre-generated like the card id, so the row is inserted in the same `saveTurn` transaction |
| 4 | Offer "slot" column | `lineIndex Int?` (PRODUCT only) | The other kinds fill a single-valued slot named by `kind`; a typed int beats an untyped JSON slot |
| 5 | `optionId` / `chosenOptionId` type | INTEGER (position) | SAD §8 IDs: option id is its position, stable because options are frozen |
| 6 | Options storage | JSONB array on the row | ADR-0001 option 1 ("options as JSON"); frozen, never queried by element |
| 7 | One-open-offer guard | Partial unique `(conversationId) WHERE state='OPEN'` + plain `conversationId` index | SAD §5/§6 Flags; partial index cannot serve reopen/cascade reads of non-open rows |
| 8 | `ConversationMessage.origin` nullability | Nullable, NULL on ASSISTANT, backfill USER → TYPED, readers treat NULL USER as TYPED | Origin of a reply is meaningless; no CHECK in the repo; covers the deploy window |
| 9 | Start-point enum values | `AI_SECTION`, `INVOICE_LIST`, `DASHBOARD_PROMPT`, `DASHBOARD_CREATE` | The four start points spec §1 / SAD §12 name |
| 10 | `startedFrom` nullability | `NOT NULL DEFAULT 'AI_SECTION'` | SAD §7 assumption for existing rows; catalog-only add; old build's inserts get a valid value |
| 11 | `issuedFromChat` shape | `BOOLEAN NOT NULL DEFAULT false`, write-once by service | SAD §7 names a flag; repo enforces write-once in services (as `issuedAt`), no triggers |
| 12 | Indexes on origin / startedFrom / issuedFromChat | None | SAD §6 Flags: KPI/reporting reads only |
| 13 | One migration (SAD §7) vs several | Five ordinals | Skill rule: no mega-migration; separate rollback per change; backfill reviewable |
| 14 | Test fixtures | Documented, not generated | ai-assistant precedent: Prisma types do not exist until promotion |

## TBD / open items

- No `<!-- TBD -->` in `data-model.md`.
- `implement`: rehearse the promotion on a throwaway container (see Verification).
- `api`: the `options[].ref` and `label` JSON shapes and the `chatRequestSchema` `choice` / `origin` / `startedFrom` fields are owned by the zod schemas the contract derives.
- SAD §7 "one Prisma migration" wording vs the five staged ordinals: harmless; `implement` may fold 01/02/04/05 if preferred.

## Next stage

`/sdd:api ai-chat-v2`
