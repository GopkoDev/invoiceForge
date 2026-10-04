---
id: T01
title: "Promote the five staged migrations and extend the test support for keys, usage and time zone"
layer: "migration"
deps: []
blocks: ["T04", "T09", "T10", "T11", "T22", "T23"]
acs: ["AC-26"]
files_hint: ["docs/features/mcp-server/migrations/01_add_user_time_zone.up.sql", "docs/features/mcp-server/migrations/01_add_user_time_zone.down.sql", "docs/features/mcp-server/migrations/02_add_user_overdue_notice_dismissed_at.up.sql", "docs/features/mcp-server/migrations/02_add_user_overdue_notice_dismissed_at.down.sql", "docs/features/mcp-server/migrations/03_create_personal_key.up.sql", "docs/features/mcp-server/migrations/03_create_personal_key.down.sql", "docs/features/mcp-server/migrations/04_create_personal_key_usage_week.up.sql", "docs/features/mcp-server/migrations/04_create_personal_key_usage_week.down.sql", "docs/features/mcp-server/migrations/05_add_mcp_limit_scopes.up.sql", "docs/features/mcp-server/migrations/05_add_mcp_limit_scopes.down.sql", "prisma/schema/auth.prisma", "tests/support/factories/user.ts", "tests/support/factories/personal-key-usage-week.ts", "tests/support/db/truncate.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T01 — Promote the five staged migrations and extend the test support for keys, usage and time zone

## Place in the sequence

- **Blocked by:** — · **Blocks:** T04 — Read the Freelancer time zone from the account in both ActingFreelancer factories and save it from settings, T09 — Create, list and revoke Personal keys through the business layer and server actions, T10 — Add the per-key and per-source MCP limit scopes that fail closed, T11 — Authenticate a presented Personal key and record its last use and weekly usage, T22 — Show the overdue-rule notice and the Connect your AI entry point on the dashboard, T23 — Add Personal keys, weekly usage and the time zone to the data export and verify deletion removes them · **Wave:** 1 — every schema-dependent task waits on it.
- **Lane:** own lane; `layer: migration` is serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** my Personal keys listed in my data export and removed when I delete my account
> **So that** nothing keeps access to my data after I leave
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task lays down the schema every other task reads, and its `ON DELETE CASCADE` foreign keys are what remove keys and usage with the account.

## Inlined context

> **Mode:** brownfield delta. This feature adds two tables (`PersonalKey`, `PersonalKeyUsageWeek`), two nullable columns on `User` (`timeZone`, `overdueNoticeDismissedAt`) and two values to the existing `LimitScope` enum (`MCP_KEY`, `MCP_SOURCE`). It adds **no** index to `Invoice` or `Customer`.
> **Staged migrations:** `docs/features/mcp-server/migrations/0{1..5}_*.{up,down}.sql`. They are **not** in the live `prisma/migrations/` tree yet. `implement` promotes them.
>
> — `data-model.md` header, Mode + Staged migrations, abridged · full text: [data-model.md](../data-model.md)

> `prisma migrate diff --from-schema prisma/schema --to-schema <schema with these edits>` produces exactly the DDL of the five staged `.up.sql` files, without the idempotency guards. Prisma emits the two `User` columns in one `ALTER TABLE`, and they are split here into 01 and 02. The end state is the same, so promotion leaves no drift.
>
> — `data-model.md §Entities, Prisma schema note, verbatim` · full text: [data-model.md](../data-model.md)

> `deleteAccount` (`lib/services/account/account.ts:44`) already ends its transaction with `prisma.user.delete`. That one statement cascades `PersonalKey`, then `PersonalKeyUsageWeek` (through `PersonalKey`), then the `MCP_KEY` limit rows (through `userId`), all inside the same transaction (verified). `MCP_SOURCE` rows belong to no account and are left to the 24 h sweep.
>
> — `data-model.md §Account deletion, abridged` · full text: [data-model.md](../data-model.md)

> Test fixtures — `createUser` (`tests/support/factories/user.ts`) accepts `timeZone` and `overdueNoticeDismissedAt` overrides. The AC-23 / AC-23b fixtures use `Europe/Kyiv` and `America/New_York`. `createPersonalKeyUsageWeek(prisma, overrides)` in `tests/support/factories/personal-key-usage-week.ts`. Defaults: `weekStart` = Monday 00:00 UTC of the test clock's now, all counts 0. Add `'PersonalKeyUsageWeek'` and `'PersonalKey'` to `APP_TABLES` in `tests/support/db/truncate.ts`, before `'User'`. PII guard: users stay `user-<n>@example.test`, and key names are neutral (`Test key 1`). Fixtures never contain a real key.
>
> — `data-model.md §Test fixtures, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** Conventions — `prisma migrate` with the split schema `prisma/schema/{base,auth,invoice}.prisma`. The new models go in `auth.prisma`, next to `LimitEvent`. No `CHECK` constraints, triggers or expression/partial indexes. Idempotent DDL (`IF NOT EXISTS`, `DO $$ … IF NOT EXISTS` for FKs), as in `20261002120000_create_limit_event`.
>
> — `data-model.md` header, Conventions followed, abridged · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Staged pairs promoted by this task (in order): `01_add_user_time_zone`, `02_add_user_overdue_notice_dismissed_at`, `03_create_personal_key`, `04_create_personal_key_usage_week`, `05_add_mcp_limit_scopes` — each `docs/features/mcp-server/migrations/<NN>_*.up.sql` / `*.down.sql`.

| Table | Column | Type | Constraints | Change |
|---|---|---|---|---|
| `User` | `timeZone` | TEXT | NULL | added (NULL = UTC until saved) |
| `User` | `overdueNoticeDismissedAt` | TIMESTAMP(3) | NULL | added |
| `PersonalKey` | `id`, `userId`, `name`, `activeNameKey`, `digest`, `lastFour`, `lastUsedAt`, `firstSuccessAt`, `revokedAt`, `createdAt`, `updatedAt` | TEXT / TIMESTAMP(3) | PK `id`; FK `userId` → `User(id)` ON DELETE CASCADE; UNIQUE `digest`; UNIQUE (`userId`, `activeNameKey`) | new table |
| `PersonalKeyUsageWeek` | `personalKeyId`, `weekStart`, `attempts`, `successes`, `assistantErrors` | TEXT / TIMESTAMP(3) / INTEGER DEFAULT 0 | PK (`personalKeyId`, `weekStart`); FK → `PersonalKey(id)` ON DELETE CASCADE | new table |
| `LimitScope` (enum) | `MCP_KEY`, `MCP_SOURCE` | enum | — | values added |

— `data-model.md §Entities, User / PersonalKey / PersonalKeyUsageWeek / LimitEvent, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-26 — cross-context

> **Given** a Freelancer with active Personal keys
> **When** they delete their account
> **Then** every key stops working from that moment, and an Assistant using one is refused as in AC-07
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

(This task owns the schema half: the cascade removes every key row. The refusal half is T11/T12.)

## Checklist

- [ ] Promote the five staged pairs into `prisma/migrations/` following the `20261002120000_create_limit_event` precedent (timestamped dirs, `migration.sql`), keeping the 01→05 order.
- [ ] Apply the Prisma model edits from `data-model.md` to `prisma/schema/auth.prisma` (`User.timeZone`, `User.overdueNoticeDismissedAt`, `User.personalKeys`, `LimitScope` + 2 values, `PersonalKey`, `PersonalKeyUsageWeek`); run `prisma generate`.
- [ ] Run `prisma migrate diff` against the promoted tree — expect no drift.
- [ ] `tests/support/factories/user.ts` — accept `timeZone` and `overdueNoticeDismissedAt` overrides.
- [ ] `tests/support/factories/personal-key-usage-week.ts` — `createPersonalKeyUsageWeek(prisma, overrides)` with the defaults above.
- [ ] `tests/support/db/truncate.ts` — add `'PersonalKeyUsageWeek'`, `'PersonalKey'` before `'User'`.
- [ ] Integration test: create a user with a key (insert the row directly with a fixture digest — the generator arrives in T03/T09), a usage week and an `MCP_KEY` `LimitEvent` row, then `prisma.user.delete` → all gone.

## Edge cases

| Case | Behaviour |
|---|---|
| Migration re-run on a DB that already has the objects | idempotent DDL — no error, no change |
| Down migration of 05 (enum values) | follows the staged `05_*.down.sql` exactly; reverts cleanly on a throwaway DB |
| Existing users after 01/02 | `timeZone` and `overdueNoticeDismissedAt` are NULL — no backfill (intended) |
| `MCP_SOURCE` rows on account deletion | not cascaded (no `userId`); left to the 24 h sweep |

## Definition of Done

- [ ] The five staged pairs are promoted into prisma/migrations, apply and revert cleanly on a throwaway database with no Prisma drift, and an integration test shows prisma.user.delete cascades PersonalKey, PersonalKeyUsageWeek and MCP_KEY limit rows.
- [ ] staged migrations are promoted to live `prisma/migrations/`, then apply and revert cleanly
- [ ] `createUser` overrides, `createPersonalKeyUsageWeek` and the `APP_TABLES` order are in place (the `createPersonalKey` factory is T09's)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
