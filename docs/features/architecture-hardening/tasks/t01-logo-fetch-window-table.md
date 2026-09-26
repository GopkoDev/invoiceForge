---
id: T01
title: "Add the LogoFetchWindow table and Prisma model"
layer: "migration"
deps: ["T00"]
blocks: ["T04", "T07"]
acs: ["AC-03"]
files_hint: ["docs/features/architecture-hardening/migrations/01_create_logo_fetch_window.up.sql", "docs/features/architecture-hardening/migrations/01_create_logo_fetch_window.down.sql", "prisma/schema/auth.prisma", "prisma/migrations/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T01 — Add the LogoFetchWindow table and Prisma model

## Place in the sequence

- **Blocked by:** — · **Blocks:** T04 — Implement the per-Freelancer sliding-window logo rate limiter, T07 — Add, backfill and uniquely index Invoice.invoiceNumberKey (expand step) · **Wave:** wave 1 — the image-conversion security release, shipped alone first (spec §1).
- **Lane:** shares files with T07 (`prisma/migrations/`), T30 (`prisma/migrations/`) — serialized by `implement`; `layer: migration` is always serialized in migration order.

## Why (user story)

> **As a** Freelancer
> **I want** my sender profile's logo fetched for my PDFs only from safe, real image links
> **So that** my invoices carry my branding and the app can't be abused to reach internal systems
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task creates the storage the per-Freelancer logo rate limit counts in, so "too many requests, try again in a minute" can be enforced across serverless invocations.

## Inlined context

> Rate-limit logo fetches with a Postgres sliding-window counter. It meets the NFR with no new infrastructure, the upsert is race-free under concurrent invocations, and one extra indexed write per real fetch is negligible at ≤ 30 per minute.
>
> — `adr/0008, Decision outcome, abridged` · full text: [ADR-0008](../adr/0008-rate-limit-logo-fetches-with-a-postgres-sliding-window-counter.md)

> | 1 | ADR-0001, ADR-0003, ADR-0008; A1, A2, F1, F2 | new `LogoFetchWindow` table | old code ignores the table |
>
> — `sad.md §7, wave table row 1, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** Every schema change is expand-only inside its wave, so the previous build can be redeployed without a database rollback (§6 NFR: 0 minutes of planned downtime).
>
> — `sad.md §7, deployment intro, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** Migrations use `prisma migrate` with `YYYYMMDDhhmmss_snake_case` folders.
>
> — `sad.md §2, Conventions, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `userId` | TEXT | NOT NULL, PK (1/2), FK → `User(id)` ON DELETE CASCADE | added (new table) |
| `windowStart` | TIMESTAMP(3) | NOT NULL, PK (2/2) | added — UTC start of the one-minute window |
| `count` | INTEGER | NOT NULL DEFAULT 0 | added — real outbound fetches in this window |

— `data-model.md §Entities, LogoFetchWindow, abridged` · full text: [data-model.md](../data-model.md)

```prisma
model LogoFetchWindow {
    userId      String
    windowStart DateTime
    count       Int      @default(0)

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@id([userId, windowStart])
}
// and on User:  logoFetchWindows LogoFetchWindow[]
```

— `data-model.md §Entities, LogoFetchWindow Prisma schema, verbatim` · full text: [data-model.md](../data-model.md)

Staged pair: `docs/features/architecture-hardening/migrations/01_create_logo_fetch_window.up.sql` / `.down.sql` (idempotent `CREATE TABLE IF NOT EXISTS` + guarded FK; down drops the table).

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-03 — error

> **Given** a signed-in Freelancer whose logo link is not secure, is unreachable, times out, returns something other than an image, exceeds the size limit, leads (directly or after redirects) to an internal or private network address, or whose logo fetch limit per minute is reached
> **When** the Freelancer generates an invoice PDF
> **Then** the PDF is still produced without the logo, and the Freelancer sees a plain-language warning: a specific reason only for "link is not a secure web address", "file is not an image", "file is larger than the size limit" and "too many requests, try again in a minute"; unreachable, timed-out and internal or private addresses all share one message, "the logo could not be loaded from this link", so the warning never reveals which addresses exist
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `model LogoFetchWindow` and the `logoFetchWindows` back-relation on `User` — `prisma/schema/auth.prisma`
- [ ] Promote the staged pair into a new `prisma/migrations/<YYYYMMDDhhmmss>_create_logo_fetch_window/migration.sql` (up body verbatim); keep the down SQL in the task PR description / alongside as the documented revert
- [ ] Run `pnpm prisma migrate dev` locally (the configured DB is effectively a test DB) and `pnpm prisma migrate diff` to confirm no drift between schema and migration
- [ ] Apply the down SQL manually, then re-apply up, to confirm the pair reverts cleanly

## Edge cases

| Case | Behaviour |
|---|---|
| Migration re-run on a DB that already has the table | `IF NOT EXISTS` / guarded `DO $$` block → no-op, no error |
| Previous build deployed on top of the new schema | Old code ignores the table (rollback-safe, sad §7) |
| User deleted | Rows cascade via the FK; the table needs no place in the ADR-0007 transaction |

## Definition of Done

- [ ] staged migration is promoted to live `prisma/migrations/`, then applies and reverts cleanly
- [ ] `prisma migrate diff` between `prisma/schema` and the migrations shows no drift
- [ ] `pnpm prisma generate` succeeds and `prisma.logoFetchWindow` is typed
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
