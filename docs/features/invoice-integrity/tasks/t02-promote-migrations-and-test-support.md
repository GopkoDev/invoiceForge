---
id: T02
title: "Promote the four staged migrations, declare them in the Prisma schema and adapt the test factories"
layer: "migration"
deps: []
blocks: ["T07", "T08", "T10", "T11", "T12", "T20"]
acs: ["AC-18"]
files_hint: ["docs/features/invoice-integrity/migrations/01_add_invoice_version.up.sql", "docs/features/invoice-integrity/migrations/01_add_invoice_version.down.sql", "docs/features/invoice-integrity/migrations/02_create_invoice_bank_account_id_index.up.sql", "docs/features/invoice-integrity/migrations/02_create_invoice_bank_account_id_index.down.sql", "docs/features/invoice-integrity/migrations/03_single_default_sender_profile.up.sql", "docs/features/invoice-integrity/migrations/03_single_default_sender_profile.down.sql", "docs/features/invoice-integrity/migrations/04_single_default_bank_account.up.sql", "docs/features/invoice-integrity/migrations/04_single_default_bank_account.down.sql", "prisma/schema/base.prisma", "prisma/schema/invoice.prisma", "tests/support/factories/sender-profile.ts", "tests/support/factories/bank-account.ts", "tests/support/factories/invoice.ts", "tests/integration/invoice-integrity-migrations.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T02 — Promote the four staged migrations, declare them in the Prisma schema and adapt the test factories

## Place in the sequence

- **Blocked by:** — · **Blocks:** T07 — Create and duplicate invoices only as drafts…, T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice…, T10 — Decide list status changes and deletes under the row lock…, T11 — Keep exactly one default sender profile…, T12 — Keep exactly one default bank account… and lock its currency, T20 — Add the count-only pre-release report script and the release runbook · **Wave:** 1 — the schema every service task reads (`Invoice.version`, the default indexes).
- **Lane:** migration (always serialized); own files otherwise.

## Why (user story)

> **As a** Freelancer
> **I want** exactly one default sender profile and one default bank account per profile at all times
> **So that** a new invoice always starts from the profile and account I chose
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task repairs existing duplicate and missing defaults at release and installs the database backstop for "at most one", plus the version column every later invoice write bumps.

## Inlined context

> The migration adds `Invoice.version` (`INT NOT NULL DEFAULT 0`, a metadata-only change), repairs duplicate and missing defaults by keeping or promoting the earliest-created record (AC-18), and creates the two partial unique indexes in the same migration transaction (ADR-0005). … Rollback: the down migration drops the two indexes and the column; the default repair is not reverted.
>
> — `sad.md §7, Deployment view, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** … The migration first repairs duplicates and gaps (earliest-created wins) and then creates the indexes in the same migration transaction. *Amended at `data-model`:* the indexes are also declared in the schema through Prisma 7.10's `partialIndexes` preview feature (`@@unique([…], where: { isDefault: true })`), so `migrate diff` sees them and a later generated migration does not drop them.
>
> — `adr/0005-…, Decision outcome, abridged` · full text: [ADR-0005](../adr/0005-guard-single-defaults-with-partial-unique-indexes-and-a-parent-row-lock.md)

> Test fixtures for the migration task:
> - `createSenderProfile` (`tests/support/factories/sender-profile.ts:20`) and `createBankAccount` (`tests/support/factories/bank-account.ts:21`) default `isDefault` to `true`. Once 03 and 04 land, a second profile or account under the same parent violates the partial index. Change the default to "true only if it is the first under its parent", and keep the `isDefault` override. Every existing test that creates two siblings without an explicit `isDefault` changes behaviour, and the NFR "Changed test expectations" asks to list it in the PR.
> - `createInvoice` (`tests/support/factories/invoice.ts`) accepts a `version` override (default 0) and a `status` override.
> - Default-repair fixture: users and profiles with two defaults, none, and one non-earliest default, plus accounts in the same three shapes. Assert the repair table and that `updatedAt` did not change.
> - Index backstop test: a direct `prisma.senderProfile.update({ isDefault: true })` on a second profile fails with P2002 on `SenderProfile_userId_isDefault_key`. The same for bank accounts.
> - No change to `APP_TABLES`. PII guard: `example.test` emails, placeholder account numbers.
>
> — `data-model.md §Test fixtures, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** the release migration is applied by hand (`prisma migrate deploy` on dev, then production) **before** the code deploy, because the new code reads `Invoice.version`. No invoice is changed by the release.
>
> — `sad.md §11, risk "migration applied by hand", abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Object | Definition | Change | Staged file |
|---|---|---|---|
| `Invoice.version` | `INTEGER NOT NULL DEFAULT 0` | added | `01_add_invoice_version.{up,down}.sql` |
| `Invoice_bankAccountId_idx` | (`bankAccountId`), `CONCURRENTLY`, own file | added | `02_create_invoice_bank_account_id_index.{up,down}.sql` |
| `SenderProfile_userId_isDefault_key` | UNIQUE (`userId`) WHERE `isDefault` = true; repair first, same tx, table lock | added | `03_single_default_sender_profile.{up,down}.sql` |
| `BankAccount_senderProfileId_isDefault_key` | UNIQUE (`senderProfileId`) WHERE `isDefault` = true; repair first | added | `04_single_default_bank_account.{up,down}.sql` |

> | Several defaults under one parent | Only the earliest-created of them stays the default (`ORDER BY "createdAt", "id"`) |
> | Records but no default under one parent | The earliest-created record becomes the default |
> | Exactly one default (even if it is not the earliest) | Unchanged |
>
> Only `isDefault` changes. `updatedAt` keeps its value. No invoice is touched. Sender profiles are repaired first (03), then bank accounts (04). The downs drop only the indexes.
>
> — `data-model.md §Release repair of defaults, abridged` · full text: [data-model.md](../data-model.md)

Schema edits: `previewFeatures = ["partialIndexes"]` in `prisma/schema/base.prisma`; in `prisma/schema/invoice.prisma` `version Int @default(0)`, `@@index([bankAccountId])`, and the two `@@unique([…], map: "<name>", where: { isDefault: true })`.
— `data-model.md §Prisma schema edits, abridged` · full text: [data-model.md](../data-model.md)

Promotion target: `prisma/migrations/<timestamp>_<name>/migration.sql` after `20261005100000_normalize_invoice_calendar_dates`, in order 01 → 04.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-18 — cross-context

> **Given** Freelancers who, before this release, ended up with two default sender profiles, a sender profile with two default bank accounts, or sender profiles or bank accounts with no default at all
> **When** the release is applied
> **Then** where there were several defaults, only the earliest-created of them stays the default. Where there was none, the earliest-created sender profile, or the earliest-created bank account of that profile, becomes the default. Nothing else about their profiles, accounts or invoices changes, and from then on AC-17 holds
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Promote the four staged pairs into `prisma/migrations/` (timestamps in order 01 → 04); keep the staged files' comments, idempotency guards and `CONCURRENTLY` on 02.
- [ ] `prisma/schema/base.prisma` — enable `partialIndexes`; `prisma/schema/invoice.prisma` — `version`, `@@index([bankAccountId])`, two partial `@@unique` with explicit `map:`.
- [ ] `prisma generate`; `prisma migrate diff` from migrations to schema is empty.
- [ ] `tests/support/factories/sender-profile.ts`, `bank-account.ts` — `isDefault` defaults to "first under its parent"; `tests/support/factories/invoice.ts` — `version` and `status` overrides.
- [ ] Fix existing tests broken by the factory default; record each in the PR description.
- [ ] `tests/integration/invoice-integrity-migrations.test.ts` — repair fixture (three shapes × two entities), `updatedAt` unchanged, P2002 backstop for both indexes, up → down → up round-trip.

## Edge cases

| Case | Behaviour |
|---|---|
| Two defaults with equal `createdAt` | Tie broken by `id` (`ORDER BY "createdAt", "id"`) |
| Exactly one default that is not the earliest | Unchanged |
| Bank-account default under a non-default profile | Repaired independently per sender profile |
| Migration re-run | DDL `IF NOT EXISTS`; repair `UPDATE`s match no row |
| Any step fails | Whole migration rolled back; code not deployed |

## Definition of Done

- [ ] The four staged pairs are promoted into prisma/migrations, apply and revert cleanly on a throwaway database with an empty migrate diff, the default-repair integration test proves the AC-18 table with updatedAt unchanged, and a direct second isDefault=true fails with P2002 on both partial indexes.
- [ ] Factories adapted; every test whose expectation changed is listed for the PR.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
