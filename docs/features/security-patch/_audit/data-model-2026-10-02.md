# Audit — data-model — security-patch — 2026-10-02

**Mode:** brownfield delta · **Size / route:** M / standard (from `.size` / `.route`) · **target_surfaces:** `[backend-service, web-frontend]`

> **Migrations are staged. They are not yet in the live `prisma/migrations/` tree; `implement` promotes them.**

## Staged migrations

| Ordinal | Files | Kind | Promote condition |
|---|---|---|---|
| 01 | `docs/features/security-patch/migrations/01_create_limit_event.{up,down}.sql` | create 2 enums + table + 3 indexes + FK (additive) | with the task that builds `lib/security/limits/limit-store.ts`, together with the Prisma model and `User.limitEvents` |

**Promote-time convention hint.** The repo uses `prisma migrate` with timestamped folders `YYYYMMDDhhmmss_snake_case/migration.sql`. The latest live folder is `20260930200100_drop_invoice_number_exact_unique`. `implement` creates `<ts>_create_limit_event/migration.sql` holding the `.up.sql` body, timestamped at promotion, since another feature may promote first. Prisma has no down step, so the `.down.sql` stays here as the rollback runbook: `prisma db execute --file … && prisma migrate resolve --rolled-back <name>`. The up file has no `CONCURRENTLY`, so it may run as one implicit transaction. Plain `CREATE INDEX` is safe because the table is created empty in the same file.

**Prisma schema edits that must land with the promotion** are in `data-model.md` §LimitEvent: the two enums, the model, and `limitEvents LimitEvent[]` on `User`. The DDL was generated with `prisma migrate diff --from-schema prisma/schema --to-schema <copy with the model>` and then made idempotent, so the names match Prisma's defaults and `migrate diff` stays empty after promotion.

## Verification performed

- **Drift (dev DB vs schema):** checked the host first (`.env` → `ep-billowing-resonance…`, dev, per memory). `prisma migrate status` shows 15 migrations, up to date. `prisma migrate diff --from-config-datasource --to-schema prisma/schema` gives an empty migration. **No drift, so no `_drift/` fixes.** Both commands are read-only, and nothing was run against prod.
- **Drift (domain layer vs DDL):** the domain types are the Prisma-generated ones, and the Prisma schema matches the migrations (above). No hand-written structs map to tables.
- **SQL exercised on PGlite (in-memory Postgres):** the 15 repo migrations, then the up applied twice (idempotent). Results:
  - an unknown `scope` was rejected by the enum, and an unknown `userId` by the FK;
  - the advisory-lock transaction ran;
  - the window count used an **index-only scan** on `LimitEvent_scope_key_at_idx`, and the 24 h purge a bitmap scan on `LimitEvent_at_idx`;
  - the `STARTED → FAILED` flip worked, and a `User` delete cascaded only that user's export row (sign-in rows stayed);
  - the down applied twice, the schema (columns, enums, indexes) returned exactly to its original state, and a re-up after the down succeeded.
- **Mermaid:** the `erDiagram` parses (mermaid `parse()` under jsdom; `mmdc` not installed).

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches the repo | ✅ quoted PascalCase table and enum types, camelCase columns, UPPER_CASE enum values, Prisma index names (`_pkey`, `_idx`, `_fkey`) |
| Down reversibility | ✅ DROP TABLE covers the table, its 3 indexes and its FK; both enum types are dropped after it. The down is idempotent (`IF EXISTS`) |
| FK indexes | ✅ `LimitEvent.userId` → `LimitEvent_userId_idx` |
| Convention adherence | ✅ with two flagged deviations (below) |

## Convention deviations (deliberate)

1. **`LimitEvent` has no `createdAt`/`updatedAt`.** `at` is the event time, and the only update is the `STARTED → FAILED` flip. Precedent: `LogoFetchWindow`, `VerificationToken`.
2. **Column names `key` and `at`** come from ADR-0002, not the repo's `…At` style. Both are non-reserved in Postgres, and Prisma quotes all identifiers.
3. *(Not a deviation)* The repo now has two limiter tables. This is accepted in SAD §11 and ADR-0002.

## Breaking-change decomposition

None. The change is additive: new types and a new table. The previous build ignores them, so an app rollback needs no DB rollback. AC-21 explicitly rewrites no stored URLs, so there is no backfill.

## Flags back to upstream

- **New outcome `ALERTED` (design gap closed here).** Spec §6 says the lockout alert fires "at most once per address per day", and flow 1 says "no alert today", but neither the SAD nor ADR-0002 says where that state lives. It is stored as a `SIGNIN_ADDRESS` row with outcome `ALERTED`, deduped over the past 24 h, and it is purged with everything else. This means rolling 24 h, not a UTC calendar day. Confirm in `tasks` or edit flow 1's note. Owner: Dmytro Hopko.
- **Source keys are stored raw.** SAD §8 / §12 store the IPv4 address or the IPv6 /64 as the key, while address keys are HMAC digests. Spec §6.1 classes the source address as personal data. Its ≤ 24 h retention is met either way, and the column is `TEXT` in both cases. Storing `HMAC(LIMIT_KEY_SECRET, source)` would be a one-line change in `keys.ts` with no schema impact. **Not decided here.** Suggest a call in `tasks`, or a note for `/security-review`.
- **Time handling → tasks DoD.** `at` is `TIMESTAMP(3)` without a time zone. The limiter must insert `at` from the app clock and bind every cutoff as a parameter, never `now()` in a predicate (`data-model.md` §Time handling). Otherwise a non-UTC session time zone would shift every window.
- **Account deletion → tasks DoD.** Add the `SIGNIN_ADDRESS` digest delete to the `deleteAccount` transaction (`lib/services/account/account.ts:44`). Extend `tests/integration/actions/account-deletion.test.ts` to assert that both export rows (cascade) and address rows (digest) are gone.
- **Test cleanup.** Add `'LimitEvent'` to `APP_TABLES` in `tests/support/db/truncate.ts`.
- **`docs/architecture-map.md` is stale.** It reflects `ded1be7` and predates `lib/services`, `LogoFetchWindow` and the test harness (also noted in SAD §3). It is not blocking, but `survey` should refresh it.

## `<!-- TBD -->` items

None in `data-model.md`. The `ALERTED` day semantics and the source-key digest above are the open calls.

## Seeds

None. No bootstrap or lookup data. Test fixtures (`createLimitEvent`) are specified in `data-model.md` §Test fixtures and built in the migration task, because the Prisma type does not exist until promotion.

## Next stage

`/sdd:api security-patch`. There is a contract change: `GET /api/user/export` gains `429` with `Retry-After`, `ActionResult` gains `RATE_LIMITED` with `RETRY_AT`, and the new `GET /api/cron/purge-limits` and the error tunnel are added. So `api`'s N/A condition does not hold.
