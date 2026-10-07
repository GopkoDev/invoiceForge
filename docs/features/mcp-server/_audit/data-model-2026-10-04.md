# Audit — data-model — mcp-server — 2026-10-04

**Mode:** brownfield delta · **Size / route:** M / standard (from `.size` / `.route`) · **target_surfaces:** `[backend-service, web-frontend]`

> **Migrations are staged. They are not yet in the live `prisma/migrations/` tree; `implement` promotes them.**

## Staged migrations

| Ordinal | Files | Kind | Promote with |
|---|---|---|---|
| 01 | `docs/features/mcp-server/migrations/01_add_user_time_zone.{up,down}.sql` | add nullable column (catalog-only) | the task that moves `ActingFreelancer` to the account zone (ADR-0006) |
| 02 | `docs/features/mcp-server/migrations/02_add_user_overdue_notice_dismissed_at.{up,down}.sql` | add nullable column (catalog-only) | the overdue-notice task |
| 03 | `docs/features/mcp-server/migrations/03_create_personal_key.{up,down}.sql` | create table + 2 unique indexes + FK (additive) | the `lib/services/personal-keys` task |
| 04 | `docs/features/mcp-server/migrations/04_create_personal_key_usage_week.{up,down}.sql` | create table + PK + FK (additive) | the weekly-usage task. **After 03** (FK) |
| 05 | `docs/features/mcp-server/migrations/05_add_mcp_limit_scopes.{up,down}.sql` | `ALTER TYPE … ADD VALUE` ×2 (additive) | the `lib/security/limits` scopes task. **After security-patch's `20261002120000_create_limit_event`** (it creates `LimitScope`) |

**Promote-time convention hint.**
- The repo uses `prisma migrate` with timestamped folders `YYYYMMDDhhmmss_snake_case/migration.sql`. The latest live folder is `20261002120000_create_limit_event`.
- `implement` creates one folder per ordinal (e.g. `<ts>_add_user_time_zone/migration.sql` holding the `.up.sql` body), timestamped at promotion in ordinal order, since another feature may promote first.
- Prisma has no down step, so each `.down.sql` stays here as the rollback runbook: `prisma db execute --file … && prisma migrate resolve --rolled-back <name>`. Run the downs in reverse order (05 → 01). 04's down must run before 03's.
- No file uses `CONCURRENTLY`, so each may run as one implicit transaction.
- `ALTER TYPE … ADD VALUE` inside a transaction block needs PostgreSQL 12+, and nothing in 05 uses the new values in the same transaction. Neon runs PG 15+ (confirm the major version in the Neon console at promotion).

**Prisma schema edits that must land with each promotion** are in `data-model.md`:
- 01 and 02: the `User` columns. 01 also adds the `personalKeys` relation, but only together with 03.
- 03: `PersonalKey`.
- 04: `PersonalKeyUsageWeek`.
- 05: the two `LimitScope` values. `LIMIT_SCOPES` in `lib/security/limits/scopes.ts` must gain both entries in the same task, because `scopeConfig` throws on an unconfigured scope.

The DDL was generated with `prisma migrate diff --from-schema prisma/schema --to-schema <copy with the edits>` (offline), then made idempotent, so names match Prisma's defaults and `migrate diff` stays empty after promotion.

## Verification performed

- **Drift (dev DB vs schema):** checked the host first (`.env` → `ep-billowing-resonance…`, dev, per memory). Both commands below are read-only. Nothing was run against prod.
  - `prisma migrate status`: 16 migrations, and **one is not applied on dev**: `20261002120000_create_limit_event` (security-patch).
  - `prisma migrate diff --from-config-datasource --to-schema prisma/schema`: exactly that migration's DDL and nothing else. So there is **no drift** between the schema and the migrations, and no `_drift/` fixes. Dev is one migration behind. Apply security-patch's migration on dev before promoting 05.
- **Drift (domain layer vs DDL):** the domain types are the Prisma-generated ones. No hand-written structs map to tables.
- **SQL exercised on PGlite (in-memory Postgres):** the 16 repo migrations, then all five ups applied twice (idempotent). Results:
  - **Time zone:** the conditional seed never overwrites a saved zone.
  - **Names:** the same active name in another case was rejected by `PersonalKey_userId_activeNameKey_key`. The same name for another Freelancer was accepted. A name became reusable after revoke, and two revoked keys could share a name.
  - **Constraints:** a duplicate digest was rejected, and so was an unknown `userId` (FK). The advisory-lock create transaction ran.
  - **Last use:** the second last-use update within a minute affected 0 rows.
  - **Usage:** the usage upsert accumulated `attempts 3 / successes 1 / assistantErrors 1`, and a usage row for an unknown key was rejected.
  - **Limit scopes:** an unknown `LimitScope` value was rejected.
  - **Plans:** authenticate used `PersonalKey_digest_key` (index scan). The entry-point `EXISTS` used the `userId` prefix of the unique index. The usage export used `PersonalKeyUsageWeek_pkey`.
  - **Cascade:** a `User` delete removed that user's keys, usage rows and `MCP_KEY` limit rows. `MCP_SOURCE` rows and the other Freelancer's keys stayed.
  - **Downs:** applied twice in reverse order, and the schema (columns, indexes, enums, constraints) returned **exactly** to its pre-up state. 05's down kept the existing `EXPORT` and `SIGNIN_SOURCE` rows and all four `LimitEvent` indexes. A re-up after the down succeeded.
  - **Scale:** with 40 Freelancers × 5,000 invoices (200,000 rows), the Debtors query with the new overdue rule ran in 12 ms (bitmap scans on `Invoice_senderProfileId_idx` + `Invoice_status_idx`). So no new `Invoice` index (`data-model.md` §Indexes).
- **Mermaid:** the `erDiagram` parses (mermaid `parse()` under jsdom; `mmdc` not installed).

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches the repo | ✅ quoted PascalCase tables, camelCase columns, UPPER_CASE enum values, Prisma's default names (`_pkey`, `_key`, `_fkey`) |
| Down reversibility | ✅ each ADD COLUMN has a DROP COLUMN. Each CREATE TABLE has a DROP TABLE, which covers its indexes and FKs. The enum ADD VALUE is reverted by a type rebuild, the only way in Postgres. All downs are idempotent |
| FK indexes | ✅ `PersonalKey.userId` → leading column of `PersonalKey_userId_activeNameKey_key`. `PersonalKeyUsageWeek.personalKeyId` → leading column of `PersonalKeyUsageWeek_pkey` |
| Convention adherence | ✅ with the deviations below |

## Convention deviations (deliberate)

1. **`PersonalKeyUsageWeek` has no `createdAt`/`updatedAt`.** It is a counter table. Precedent: `LogoFetchWindow`.
2. **No separate `@@index([userId])` on `PersonalKey`.** The unique index's leading column serves it. The repo sometimes keeps both (`Invoice` has `senderProfileId` alone and in its unique), but a duplicate costs writes and serves no query.
3. **Two app-side invariants with no DB form:** at most 10 active keys, and `activeNameKey IS NULL` ⇔ revoked. The repo uses no `CHECK`s or triggers. The first holds under the per-Freelancer advisory lock. The second holds because only the create and revoke paths write those columns.

## Decisions taken at this stage (user-confirmed, 2026-10-04)

| Question | Decision |
|---|---|
| Key-activation KPI ("within 7 days of creation") cannot be computed from weekly buckets | `PersonalKey.firstSuccessAt`, written once |
| SAD flag: Assistant-side mistakes lower the successful-call share | Separate `assistantErrors` counter beside `attempts` and `successes`. The KPI formula picks what to exclude |
| Spec §8 open question: where the dismissal of the overdue-rule notice lives | `User.overdueNoticeDismissedAt` (per account, all devices) |
| Week boundary for the usage aggregate | ISO week, Monday 00:00 UTC |

Also decided here, from SAD flags:
- **Atomic key creation (SAD §6 flag):** a per-Freelancer `pg_advisory_xact_lock`, then the count, the name check and the insert. The unique `(userId, activeNameKey)` index is the backstop. A nullable column was chosen instead of a partial expression index, because Prisma cannot represent the latter.
- **Per-key limit key** = `PersonalKey.id`, with `userId` set so account deletion cascades the rows. **Per-source key** = the existing `sourceLimitKey()` HMAC digest.

## Breaking-change decomposition

None. Every change is additive: two nullable columns with no default (catalog-only), two new tables, two enum values. The previous build ignores all of them, so an app rollback needs no DB rollback.
- No backfill: zones fill on the next visit (ADR-0006).
- The overdue rule changes figures at read time only, and stored statuses are untouched (ADR-0005).

## Flags back to upstream

- **SAD flow 15 and §11 risk "Account deletion … RESTRICT".** The new tables use `ON DELETE CASCADE` from `User`, as every other user-owned table except `Invoice` does. So `deleteAccount` needs **no code change**: the existing `prisma.user.delete` in the transaction removes keys, usage and `MCP_KEY` limit rows atomically (verified). Edit flow 15's note ("delete weekly usage, Personal keys, then the rest") and close the §11 risk at `tasks`. Keep the AC-26 integration test. Owner: Dmytro Hopko.
- **Spec §7 successful-call share formula.** With `assistantErrors` recorded separately, the spec should say whether the KPI is `successes / attempts` or `successes / (attempts − assistantErrors)`. Owner: Dmytro Hopko, before `ship`.
- **Spec §8 overdue notice → tasks.** The question is resolved as "a per-account dismissal". Two rules for `tasks`:
  - Show the notice only to Freelancers whose `createdAt` is before the release, because new Freelancers never saw the old rule.
  - Tick the §8 checkbox.
- **Usage write failures → tasks DoD.** Decide whether a failed usage upsert fails the call. The recommendation is no: log and report it to Sentry, but return the answer, since counts are observability. It must still never be skipped silently in tests.
- **Export → tasks DoD.**
  - Add `personalKeys` (name, createdAt, lastUsedAt, revokedAt + usage weeks) and `user.timeZone` / `overdueNoticeDismissedAt` to `readExport`.
  - Add a test asserting the export has no `digest`, `lastFour` or `activeNameKey` (AC-25).
- **Limit scopes → tasks DoD.** Add `MCP_KEY: { windowMs: 60 s, max: 60, countedOutcomes: ['REQUESTED'] }` and `MCP_SOURCE: { windowMs: 5 min, max: 30, countedOutcomes: ['REFUSED'] }` to `LIMIT_SCOPES` with migration 05.
- **Test cleanup.** Add `'PersonalKeyUsageWeek'` and `'PersonalKey'` to `APP_TABLES` in `tests/support/db/truncate.ts`.
- **Dev DB is one migration behind** (security-patch `create_limit_event`). Apply it before promoting 05 on dev.
- **`docs/architecture-map.md` is stale** (`ded1be7`; predates `lib/services`, `LimitEvent` and the test harness). Not blocking; `survey` should refresh it.

## `<!-- TBD -->` items

None in `data-model.md`. The KPI formula and the usage-write failure policy above are the open calls.
