# Audit — data-model — invoice-integrity — 2026-10-07

**Mode:** brownfield delta · **Size / route:** M / standard (from `.size` / `.route`) · **target_surfaces:** `[backend-service, web-frontend]`

> **The migrations are staged. They are not in the live `prisma/migrations/` tree yet; `implement` promotes them.**

## Staged migrations

| Ordinal | Files | Kind | Promote with |
|---|---|---|---|
| 01 | `docs/features/invoice-integrity/migrations/01_add_invoice_version.{up,down}.sql` | add a `NOT NULL DEFAULT 0` column (catalog-only, PG 11+) | the version-check task (ADR-0004). The new code reads `version`, so this must be applied **before** the code is deployed (SAD §7) |
| 02 | `docs/features/invoice-integrity/migrations/02_create_invoice_bank_account_id_index.{up,down}.sql` | `CREATE INDEX CONCURRENTLY` on an existing table. **Single statement — keep it alone in its migration** | the bank-account currency-lock task (AC-13) |
| 03 | `docs/features/invoice-integrity/migrations/03_single_default_sender_profile.{up,down}.sql` | data repair + partial unique index, one explicit transaction, `LOCK TABLE … SHARE ROW EXCLUSIVE` | the sender-profile default task (ADR-0005). It lands together with the `previewFeatures = ["partialIndexes"]` generator change and the factory change (see Test fixtures in `data-model.md`) |
| 04 | `docs/features/invoice-integrity/migrations/04_single_default_bank_account.{up,down}.sql` | same as 03, on `BankAccount` | the bank-account default task (ADR-0005). Order after 03 is conventional only: the two are independent |

**Promote-time convention hint.**
- The repo uses `prisma migrate` with timestamped folders `YYYYMMDDhhmmss_snake_case/migration.sql`. The latest live folder is `20261005100000_normalize_invoice_calendar_dates`.
- `implement` creates one folder per ordinal (e.g. `<ts>_add_invoice_version/migration.sql` holding the `.up.sql` body), timestamped at promotion time in ordinal order, because another feature may promote first.
- Prisma has no down step, so each `.down.sql` stays here as the rollback runbook: `prisma db execute --file … && prisma migrate resolve --rolled-back <name>`. Run the downs in reverse order (04 → 01). 01's down only after the previous build is deployed.
- 02 must stay a single statement (CONCURRENTLY cannot run inside a transaction block). 03 and 04 carry their own `BEGIN … COMMIT`. Prisma accepted this, and so did `psql`.
- Every DB command targets a host checked first: `.env` = dev, `.env.prod` = prod (memory). The production release order is: the count-only report → `migrate deploy` → the code deploy (SAD §6 flow 11).

**Prisma schema edits that must land with each promotion** are in `data-model.md` §Prisma schema edits: 01 → `Invoice.version`; 02 → `@@index([bankAccountId])`; 03 → the generator `previewFeatures` + `SenderProfile` `@@unique(…, where:)`; 04 → `BankAccount` `@@unique(…, where:)`.

## Verification performed

- **Prisma capability:** Prisma 7.10.0's schema engine ships the `partialIndexes` preview feature. `prisma migrate diff --from-schema prisma/schema --to-schema <edited copy>` (offline) emits exactly `ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0`, the two `CREATE UNIQUE INDEX … WHERE ("isDefault" = true)` statements with the `map:` names, and `CREATE INDEX "Invoice_bankAccountId_idx"`. `prisma validate` passes on the edited schema.
- **Drift: dev DB vs schema (read-only).** Checked the host first: `.env` → `ep-billowing-resonance…`, which is dev. `prisma migrate status` reported 22 migrations, all applied. `migrate diff --from-config-datasource --to-schema prisma/schema --exit-code` returned 0 (empty). So there is **no drift** and no `_drift/` fixes. Nothing ran against prod.
- **Drift: domain layer vs DDL.** The domain types are Prisma-generated, and no hand-written structs map to these tables.
- **SQL exercised on a throwaway PostgreSQL 16 container (Docker), never on dev or prod:**
  - **Before the feature:** all 22 live migrations were applied with `prisma migrate deploy`. `migrate diff` from the migrations to the current schema was empty.
  - **Seed:** broken defaults were seeded: a Freelancer with two defaults, one with none, and one whose single default is not the earliest. Bank accounts had three defaults under one profile and none under another.
  - **Promotion:** the four staged ups were promoted into a scratch copy of the migrations tree and applied with `prisma migrate deploy`. Results:
    - The earliest-created default was kept, and the earliest-created record was promoted where there was no default.
    - The single non-earliest default was unchanged.
    - `updatedAt` was untouched on every repaired row (AC-18).
    - `version` was added with default 0. `Invoice_bankAccountId_idx` was built (CONCURRENTLY ran under Prisma).
  - **Backstop:** a direct second default was refused by `SenderProfile_userId_isDefault_key` (unique violation).
  - **Drift after promotion:** `migrate diff` from the migrations tree **and** from the database to the edited schema, both with `--exit-code`, returned 0.
  - **Downs:** applied in reverse order. All three indexes and the column were gone. The re-ups were then applied **twice each** with `psql`: they were idempotent, the second run made no changes, and the same defaults remained.
  - **Atomicity:** in 04, an injected failure after the lock left the duplicate default in place, which shows the whole transaction rolled back. Before the `BEGIN/COMMIT` wrap, `psql` refused `LOCK TABLE` outside a transaction block. That is the reason for the wrap.
  - **Fresh database:** the final files were applied to a fresh database with `prisma migrate deploy`, followed by both diffs, which were empty.
  - **Report SQL:** every pre-release report query in `data-model.md` runs. The AC-13 count plan is an `Index Only Scan using "Invoice_bankAccountId_idx"`.
- **Mermaid:** the `erDiagram` parses (`mermaid.parse()` 11 under jsdom; `mmdc` is not installed).

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches the repo | ✅ Quoted PascalCase tables and camelCase columns. Prisma default names for `Invoice_bankAccountId_idx`. The partial uniques use explicit `map:` names in Prisma's `<Table>_<cols>_key` shape (`…_userId_isDefault_key`), because the default `SenderProfile_userId_key` would misread as "one profile per user" |
| Down reversibility | ✅ ADD COLUMN ↔ DROP COLUMN (01), CREATE INDEX ↔ DROP INDEX (02 CONCURRENTLY, 03, 04). All downs are idempotent. **The data repair in 03 and 04 is intentionally not reverted** (SAD §7): the old duplicate flags are not kept, and the previous build works with exactly one default |
| FK indexes | ✅ The new FK index covers `Invoice.bankAccountId`, the only `Invoice` FK that had none. No new FK is added. Every FK of the touched tables now has an index: `senderProfileId`, `customerId`, `bankAccountId`, `InvoiceItem.invoiceId`/`productId`, `BankAccount.senderProfileId`, `SenderProfile.userId` |
| Convention adherence | ✅ with the deviations below |

## Convention deviations (deliberate)

1. **First partial indexes in the repo, and the first Prisma preview feature** (`partialIndexes`). The owner chose this on 2026-10-07 over keeping raw-SQL-only indexes. It keeps `migrate diff` honest and removes the SAD §11 risk "a later generated migration could drop them". The cost: a Prisma upgrade that changes the preview must re-run `migrate diff` (recorded in ADR-0005 Consequences).
2. **Explicit `BEGIN … COMMIT` in 03 and 04.** The repo's migrations rely on Prisma's implicit multi-statement transaction. Here the explicit block makes the repair-plus-index atomic under any runner, which `psql` proved necessary for `LOCK TABLE`.
3. **`LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE`** in 03 and 04. It is new in the repo. It blocks writes to `SenderProfile` and `BankAccount` for the few milliseconds of the repair (the tables hold a handful of rows per Freelancer). This stops the previous build, still live during the release, from adding a second default between the repair and the index.

## Flags back to upstream (not edited here)

- **SAD §5, decomposition tree:** "`<ts>_invoice_integrity/` … partial unique indexes (raw SQL)" now means **four** staged migrations, with the indexes declared in the schema through the preview feature.
- **SAD §7, deployment:** "One Prisma migration ships with the release". It is now four, applied by the same single `prisma migrate deploy`. Each is backward-compatible with the previous build, so a failure in 03 or 04 leaves 01 and 02 applied, which is harmless. The release stops before the code deploy as planned (flow 11).
- **SAD §11, risk row** "The partial unique default indexes live outside `schema.prisma`…": mitigated by the preview feature. Keep the integration test.
- **SAD §6 flow 11** draws "one transaction" for the whole migration. It is one transaction per repair file, and the column and FK index are separate files.
- **ADR-0005** was amended in place (Decision outcome and Consequences) with the owner's 2026-10-07 decision. Its status stays Accepted.
- **Accepted, not a schema matter:** `InvoiceItem.currency` (nullable, unused by these rules) stays as is. The AC-12 check uses the catalogue product's currency.

## Breaking-change decompositions

None needed. Each change is additive (a column with a default, indexes) or a data repair that reduces state to what the previous build already assumes. There is no rename, no drop, and no new `NOT NULL` on existing data without a default.

## Open `<!-- TBD -->`

None in `data-model.md`. Spec §8 "what the pre-release report finds" stays open (owner: Dmytro Hopko, due before the production deploy). `data-model.md` §Pre-release count-only report fixes the definitions the script and the KPI re-run must share.

## Next stage

`/sdd:api invoice-integrity`. The contract changes: `loadedVersion` on save, `CONFLICT`, new `fieldErrors`, and the returned `version`.
