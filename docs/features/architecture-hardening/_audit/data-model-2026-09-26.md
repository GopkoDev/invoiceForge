# Audit — data-model — architecture-hardening — 2026-09-26

**Mode:** brownfield delta · **Size / route:** M / standard (from `.size` / `.route`) · **target_surfaces:** `[backend-service, web-frontend]`

> **Migrations are staged. They are not yet in the live `prisma/migrations/` tree; `implement` promotes them.**

## Staged migrations

| Ordinal | Files | Wave | Kind | Promote condition |
|---|---|---|---|---|
| 01 | `docs/features/architecture-hardening/migrations/01_create_logo_fetch_window.{up,down}.sql` | 1 | create table + FK | with the wave-1 build |
| 02 | `…/02_add_invoice_number_key.{up,down}.sql` | 2 | expand: nullable column | with the wave-2 build; run the duplicate pre-flight first |
| 03 | `…/03_backfill_invoice_number_key.{up,down}.sql` | 2 | backfill (**review the SQL**) | after 02 |
| 04 | `…/04_create_invoice_number_key_unique.{up,down}.sql` | 2 | `CREATE UNIQUE INDEX CONCURRENTLY`, single statement | after 03 |
| 05 | `…/05_set_invoice_number_key_not_null.{up,down}.sql` | 4 | contract: `SET NOT NULL` | only if wave 2 ran without a rollback **and** the NULL-key pre-flight returns 0 |
| 06 | `…/06_drop_invoice_number_exact_unique.{up,down}.sql` | 4 | contract: drop the exact-match unique, `CONCURRENTLY`, single statement | only after 05 |

**Promote-time convention hint.** The repo uses `prisma migrate` with timestamped folders `YYYYMMDDhhmmss_snake_case/migration.sql`; the latest is `20260111174554_add_invoice_item_fields`. `implement` gives each ordinal its own folder, timestamped at promotion and in ordinal order (e.g. `<ts>_create_logo_fetch_window/migration.sql` holding the `.up.sql` body). Prisma has no down step, so the `.down.sql` files stay here as the rollback runbook (`prisma db execute --file … && prisma migrate resolve --rolled-back <name>`). Keep 04 and 06 as **separate** folders with one statement each: Prisma sends a migration file as a single script, which Postgres runs as one implicit transaction, and `CONCURRENTLY` refuses to run inside one. Verify this on a Neon preview branch before production.

**Prisma schema edits that must land with each promotion** are listed in `data-model.md` (the `LogoFetchWindow` model + `User.logoFetchWindows`; `Invoice.invoiceNumberKey` + the `@@unique` swaps). The index and constraint names in the SQL match Prisma's defaults, so `prisma migrate diff` stays empty after each wave.

## Verification performed

- **Drift (live DB vs schema):** `prisma migrate diff --from-config-datasource --to-schema prisma/schema` gives an empty migration. `prisma migrate status` reports 9 migrations, all applied. **No drift → no `_drift/` fixes.**
- **Drift (migrations vs schema):** every index, unique and FK in `prisma/migrations/*` matches `prisma/schema/*.prisma`, including the dropped `Authenticator` table and the dropped `CustomPrice_productId_customerId_key`.
- **SQL exercised on PGlite (in-memory Postgres):** the 9 repo migrations, then 01–04 applied twice (idempotent). Results:
  - the backfill left a normalized-duplicate pair NULL and keyed a tab/newline-padded number as `inv-001`;
  - the key unique blocked a normalized duplicate;
  - 05 refused while NULL keys remained, and passed after they were fixed;
  - 05 + 06 applied twice;
  - the counter upsert incremented 1 → 2, and a `User` delete cascaded its windows;
  - the downs 06 → 01 applied twice, and the schema returned to its original state.
- **Mermaid:** the `erDiagram` parses (mermaid `parse()` under jsdom).

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches the repo | ✅ quoted PascalCase tables, camelCase columns, Prisma index names (`_pkey`, `_fkey`, `_key`) |
| Down reversibility | ✅ every CREATE has a DROP, ADD COLUMN has DROP COLUMN, CREATE INDEX has DROP INDEX, SET NOT NULL has DROP NOT NULL, and the backfill has a NULL reset. The downs are idempotent (guarded) |
| FK indexes | ✅ `LogoFetchWindow.userId` is covered by the leading PK column. No other new FK |
| Convention adherence | ✅ with two flagged deviations (below) |

## Convention deviations (deliberate)

1. **`LogoFetchWindow` has a composite PK and no cuid `id`.** Precedent: `Account` and `VerificationToken` use `@@id`. The PK is the upsert's conflict target.
2. **`LogoFetchWindow` has no `createdAt`/`updatedAt`.** Precedent: `VerificationToken`. The row is itself a timestamped counter and lives about two minutes.
3. *(Not a deviation, but new to the repo)* `CREATE/DROP INDEX CONCURRENTLY` in single-statement migrations. Existing migrations use plain `CREATE INDEX`, which was fine on empty tables; the `Invoice` table now holds production data.

## Breaking-change decomposition

The move from `Invoice.invoiceNumber` exact-unique to `invoiceNumberKey` unique is split into **expand** (02, wave 2), **backfill** (03, wave 2), **enforce** (04, wave 2), and **contract** (05 + 06, wave 4, conditional). This matches SAD §7's rollback-safety table: old code writes NULL keys, the unique index tolerates them, and the exact unique stays in force until the contract step.

## Flags back to upstream

- **SAD §6 flow 9 / §6 "Hints for data-model":** the "unique (Customer, product) on custom prices" hint conflicts with the repo's deliberate removal of that unique (`20260105020000_allow_multiple_custom_prices`, with named price tiers). AC-31 doesn't require it, so it was **not added**. Suggest editing flow 9's note to "(informs the ownership check)".
- **Normalization parity (ADR-0004):** `normalizeInvoiceNumber()` must match the backfill's `\s` trim + `lower()`. See `data-model.md` "Normalization parity". This belongs in the `tasks` DoD for the numbering task.
- **Pre-existing redundant indexes** (not touched; out of scope): `SenderProfile_invoicePrefix_idx` duplicates the unique `SenderProfile_invoicePrefix_key`. Until 06, `Invoice_senderProfileId_idx` is the left prefix of `Invoice_senderProfileId_invoiceNumber_key`. After 06 it duplicates the prefix of the new key unique instead.

## `<!-- TBD -->` items

- `data-model.md` → Customer/…/InvoiceItem section: does AC-20's "sign-in links" require deleting `VerificationToken` rows for the account's email inside the deletion transaction? That table has no FK to `User`, so the cascade doesn't reach it. Owner: Dmytro Hopko, before `sdd:tasks`.

## Seeds

None. No bootstrap or lookup data is added, and there are no test fixtures (spec §3, F7).

## Next stage

`/sdd:api architecture-hardening`. There is a contract change (the logo endpoint takes `{ senderProfileId }`, and `ActionResult` gains typed codes), so `api`'s N/A condition does not hold.
