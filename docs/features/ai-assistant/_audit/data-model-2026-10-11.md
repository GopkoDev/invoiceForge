# Audit — data-model — ai-assistant — 2026-10-11

**Mode:** brownfield delta · **Size / route:** L / full (from `.size` / `.route`) · **target_surfaces:** `[backend-service, web-frontend]`

> **The migrations are staged. They are not in the live `prisma/migrations/` tree yet; `implement` promotes them.**

## Staged migrations

| Ordinal | Files | Kind | Promote with |
|---|---|---|---|
| 01 | `docs/features/ai-assistant/migrations/01_create_conversation.{up,down}.sql` | new enum + two new tables | the Conversation store task (ADR-0008) |
| 02 | `…/02_create_draft_card.{up,down}.sql` | new enum + new table + partial unique index | the Draft card task (ADR-0007). Needs 01 |
| 03 | `…/03_create_message_allowance_day.{up,down}.sql` | new counter table | the allowance task (ADR-0009) |
| 04 | `…/04_create_assistant_turn.{up,down}.sql` | two new enums + new table | the turn-metadata task (ADR-0004). Needs 01 |
| 05 | `…/05_add_personal_key_can_create_drafts.{up,down}.sql` | `NOT NULL DEFAULT false` column (catalog-only, PG 11+) | the Draft permission task (ADR-0011) |
| 06 | `…/06_create_personal_key_draft_day.{up,down}.sql` | new counter table | the per-key limit task (ADR-0009) |
| 07 | `…/07_create_mcp_draft_repeat.{up,down}.sql` | new table | the MCP draft tool task (ADR-0012) |
| 08 | `…/08_add_invoice_assistant_origin.{up,down}.sql` | new enum + three nullable columns + FK on `Invoice` | the origin task (ADR-0013) |
| 09 | `…/09_add_invoice_issued_at.{up,down}.sql` | nullable column on `Invoice` | the issue-time task (ADR-0013) |
| 10 | `…/10_create_invoice_assistant_key_id_index.{up,down}.sql` | `CREATE INDEX CONCURRENTLY` on an existing table. **Single statement: keep it alone in its migration** | with 08 |

**Promote-time convention hint.**
- The repo uses `prisma migrate` with timestamped folders `YYYYMMDDhhmmss_snake_case/migration.sql`. The latest live folder is `20261007100300_single_default_bank_account`.
- `implement` creates one folder per ordinal, timestamped at promotion in ordinal order, because another feature may promote first. The rehearsal below used `20261012100001_create_conversation` … `20261012100010_create_invoice_assistant_key_id_index`.
- Prisma has no down step, so each `.down.sql` stays here as the rollback runbook: `prisma db execute --file … && prisma migrate resolve --rolled-back <name>`. Run the downs in reverse order (10 → 01).
- Every up is backward-compatible with the previous build (new tables, nullable or defaulted columns). So the release order is the usual `migrate deploy` → code deploy, and a failure part-way leaves harmless applied ordinals.
- Every DB command targets a host checked first: `.env` = dev, `.env.prod` = prod (memory).

## Verification performed

- **Prisma capability:**
  - `prisma validate` passes on the edited schema copy.
  - `prisma migrate diff --from-schema prisma/schema --to-schema <edited copy>` (offline) emits exactly the CREATE TYPE / TABLE / INDEX / FK statements of the ten files, before they were made idempotent.
  - That includes `CREATE UNIQUE INDEX "DraftCard_conversationId_live_key" … WHERE ("state" = 'LIVE')`, written in the schema as `where: { state: "LIVE" }` (the bare enum form `{ state: LIVE }` does not validate).
- **Drift, dev DB vs the current schema (read-only):**
  - I checked the host first: `.env` → `ep-billowing-resonance…`, which is dev.
  - `prisma migrate status`: 26 migrations, schema up to date.
  - `migrate diff --from-config-datasource --to-schema prisma/schema --exit-code`: empty.
  - So there is **no drift** and no `_drift/` fixes. Nothing ran against prod.
- **Drift, domain layer vs DDL:** the domain types are Prisma-generated. No hand-written structs map to these tables.
- **SQL exercised on a throwaway PostgreSQL 16 container (`ai-dm-check`, removed afterwards), never on dev or prod:**
  - **Promotion:** all 26 live migrations plus the ten promoted ups were applied with `prisma migrate deploy`. `migrate diff` from the database to the edited schema was empty.
  - **Behaviour:**
    - An existing key reads `canCreateDrafts = f`.
    - A duplicate message position and a second `LIVE` card are refused by their unique indexes.
    - "Mark replaced, then insert" works in one transaction.
    - The allowance increment stops at 30.
    - A lift before the key limit is a no-op, and at 50 it gives 100.
    - A racing repeat mark fails on the PK.
    - Deleting the invoice sets the card's and the repeat mark's `invoiceId` to NULL.
    - Deleting the Conversation removes its messages and cards and keeps the turn with a NULL `conversationId` (AC-37).
    - The account-deletion statements of `lib/services/account/account.ts` leave 0 AI rows.
  - **Plans:** with sequential scans disabled, the list, the 40-message history, the 90-day purge and the latest allowance row each use the index named in `data-model.md`.
  - **Downs:** applied in reverse order. `migrate diff` from the database to the **original** schema was empty, so the downs revert completely. A second run of the downs was a no-op.
  - **Re-ups:** applied **twice** with `psql`. The second run was a no-op, and `migrate diff` to the edited schema was empty again.
- **Mermaid:** the `erDiagram` parses (`mermaid.parse()` 11.17 under jsdom; `mmdc` is not installed).

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches the repo | ✅ Quoted PascalCase tables and camelCase columns, with Prisma default names everywhere. The one exception is the partial unique: it has an explicit `map:` name in Prisma's `<Table>_<cols>_key` shape (`DraftCard_conversationId_live_key`), so it is not mistaken for "one card per Conversation", as `SenderProfile_userId_isDefault_key` |
| Down reversibility | ✅ Every CREATE TABLE / TYPE / INDEX and every ADD COLUMN / CONSTRAINT has its DROP. All downs are idempotent, and their full revert was verified by `migrate diff` against the original schema |
| FK indexes | ✅ Every new FK has an index, either its own or as the leading column of a PK or unique: `Conversation.userId`, `ConversationMessage.conversationId`, `DraftCard.{userId, conversationId, replacedById, invoiceId}`, `MessageAllowanceDay.userId`, `AssistantTurn.{userId, conversationId}`, `PersonalKeyDraftDay.personalKeyId`, `McpDraftRepeat.{personalKeyId, invoiceId}`, `Invoice.assistantKeyId` |
| Convention adherence | ✅ with the deviations below |

## Convention deviations (deliberate)

1. **First `Json` (`JSONB`) columns in the repo:** `ConversationMessage.parts`, `DraftCard.request`, `DraftCard.proposal`. ADR-0008 (Neutral) chose this. The shape is guarded by zod on write and read, not by the database.
2. **First Postgres array column:** `AssistantTurn.toolNames` (`TEXT[]`). It holds names only, and the data is metadata-only by ADR-0004.
3. **`ConversationMessage` has no `userId`.** SAD §8 says "every new domain row carries `userId`". The owner decided (2026-10-11) that a message is a child row reached only through its owned Conversation, as `InvoiceItem`. `DraftCard` and `AssistantTurn` do carry `userId`.
4. **`AssistantTurn.costUsd` is `DECIMAL(10,6)`,** not the repo's money `DECIMAL(10,2)`. A per-message model cost is a fraction of a cent.

## Flags back to upstream (not edited here)

- **SAD §5 decomposition tree:** "prisma/schema/ai.prisma … AssistantTurn" and "auth.prisma + … PersonalKeyDraftDay, McpDraftRepeat" match. The metadata field named "kind" in SAD §5 and §7 is split here into `topic` (the router verdict) and `outcome`. Rename it in the SAD when it is next touched.
- **SAD §5 or ADR-0007:** the "one live card per Conversation" rule (sequences flag) is now enforced by `DraftCard_conversationId_live_key`. Add one line to §5, or to ADR-0007 Consequences.
- **SAD §7:** "AssistantTurn rows and the daily counters past 400 days" is served by `AssistantTurn_createdAt_idx`, `MessageAllowanceDay_day_idx` and `PersonalKeyDraftDay_day_idx`. The purge uses the local `day`, not UTC time. That is up to one day's difference, which is accepted.
- **ADR-0013:** `issuedAt` has three writers in `lib/services/invoices/invoices.ts`: `createInvoice` with a non-draft status, `updateInvoice` with a status change, and `updateInvoiceStatus`. The ADR names only "the status service". The `tasks` stage must cover all three.
- **Spec §6 "History cap 40":** implemented as a read limit. Messages beyond 40 stay stored (the Freelancer sees the whole exchange, AC-35). No trim job exists. The §5 tree says "trim to 40", which means "send at most 40 to the model".

## Breaking-change decompositions

None needed. Every change is additive: new tables, a defaulted `NOT NULL` column, nullable columns, an FK whose column is all NULL, and a concurrent index. There is no rename, no drop, and no new `NOT NULL` on existing data without a default.

## Open `<!-- TBD -->`

None.

## Housekeeping noticed (not acted on)

`docker ps` showed about ten leftover `postgres:16-alpine` containers with generated names (test leftovers, see memory "e2e leaked Postgres"). They were left untouched. Remove them deliberately, never with a blind prune (the local dev DB container is among them).

## Next stage

`/sdd:api ai-assistant`. The contract changes: the chat route's UI-message stream and outcomes, the server actions (create from card, delete Conversations, lift), and the MCP `create_draft_invoice` tool.
