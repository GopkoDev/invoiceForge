---
id: T07
title: "Add, backfill and uniquely index Invoice.invoiceNumberKey (expand step)"
layer: "migration"
deps: ["T00", "T01"]
blocks: ["T12", "T30"]
acs: ["AC-08"]
files_hint: ["docs/features/architecture-hardening/migrations/02_add_invoice_number_key.up.sql", "docs/features/architecture-hardening/migrations/02_add_invoice_number_key.down.sql", "docs/features/architecture-hardening/migrations/03_backfill_invoice_number_key.up.sql", "docs/features/architecture-hardening/migrations/03_backfill_invoice_number_key.down.sql", "docs/features/architecture-hardening/migrations/04_create_invoice_number_key_unique.up.sql", "docs/features/architecture-hardening/migrations/04_create_invoice_number_key_unique.down.sql", "prisma/schema/invoice.prisma", "prisma/migrations/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T07 — Add, backfill and uniquely index Invoice.invoiceNumberKey (expand step)

## Place in the sequence

- **Blocked by:** T01 — Add the LogoFetchWindow table and Prisma model · **Blocks:** T12 — Add normalizeInvoiceNumber and the row-locked allocateInvoiceNumber, T30 — Make invoiceNumberKey NOT NULL and drop the exact-match unique (contract step) · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T01 (`prisma/migrations/`), T30 (`prisma/schema/invoice.prisma`) — serialized by `implement`; `layer: migration` is always serialized in migration order.

## Why (user story)

> **As a** Freelancer
> **I want** every invoice I save to get an invoice number that is unique within its sender profile, whether I keep the proposed number or type my own
> **So that** my numbering is continuous and a save never fails over a number I didn't choose
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task gives the database the normalized key that makes "INV-001" and " inv-001 " the same number and enforces uniqueness per sender profile.

## Inlined context

> Migration (expand-only, wave 2): add `invoiceNumberKey` nullable → backfill from `invoiceNumber` → create the unique index. `NOT NULL` is a separate contract step (SAD §7, wave 4). [...] If the production count is above 0, the column stays nullable, the duplicate rows keep `NULL` (Postgres treats NULLs as distinct), and those invoices follow AC-17: viewable, but not saveable until renumbered, because every save writes a non-null key.
>
> — `adr/0004, Decision outcome, abridged` · full text: [ADR-0004](../adr/0004-enforce-invoice-number-uniqueness-on-a-normalized-key-column.md)

> | 2 | ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007; L1–L5, L7, L10 | `Invoice.invoiceNumberKey` nullable + backfill + unique index | old code doesn't write the key, so its rows stay `NULL`, which the unique index tolerates |
>
> — `sad.md §7, wave table row 2, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** Every schema change is expand-only inside its wave, so the previous build can be redeployed without a database rollback (§6 NFR: 0 minutes of planned downtime).
>
> — `sad.md §7, deployment intro, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** MUST stay the only statement in its migration: CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and a multi-statement script runs as one implicit transaction. If a concurrent build fails it leaves an INVALID index that IF NOT EXISTS would skip: check pg_index.indisvalid, and DROP INDEX CONCURRENTLY + re-run if it is false.
>
> — `migrations/04_create_invoice_number_key_unique.up.sql, header comment, abridged` · full text: [data-model.md](../data-model.md)

> -- Before 02–04 (wave 2): normalized duplicate groups. 0 → every row gets a key. >0 → those rows stay NULL (ADR-0004 fallback, AC-17).
> SELECT "senderProfileId", lower(regexp_replace("invoiceNumber", '^\s+|\s+$', '', 'g')) AS key, count(*)
> FROM "Invoice" GROUP BY 1, 2 HAVING count(*) > 1;
>
> — `data-model.md §Pre-flight queries, wave 2, verbatim` · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Invoice.invoiceNumberKey` | TEXT | NULL (wave 2); UNIQUE with `senderProfileId` | added + backfilled |
| `Invoice.invoiceNumber` | TEXT | NOT NULL; exact unique with `senderProfileId` kept through wave 2 | unchanged |

Index: `Invoice_senderProfileId_invoiceNumberKey_key` UNIQUE (`senderProfileId`, `invoiceNumberKey`) — new.

— `data-model.md §Entities Invoice + §Indexes, abridged` · full text: [data-model.md](../data-model.md)

```prisma
// wave 2
invoiceNumberKey String?
@@unique([senderProfileId, invoiceNumber])      // kept until wave 4
@@unique([senderProfileId, invoiceNumberKey])   // new
```

— `data-model.md §Entities, Invoice Prisma schema, verbatim` · full text: [data-model.md](../data-model.md)

Staged pairs: `02_add_invoice_number_key`, `03_backfill_invoice_number_key`, `04_create_invoice_number_key_unique` (`.up.sql` / `.down.sql`) under `docs/features/architecture-hardening/migrations/`. Promote as **three** migration folders — 04 must be alone in its file.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-08 — domain invariant

> **Given** a Freelancer who types an invoice number that is already used in the same sender profile, where two numbers count as the same if they match ignoring letter case and leading or trailing spaces (so "INV-001" and " inv-001 " are the same number)
> **When** the Freelancer saves the invoice
> **Then** the system blocks the save, says that this invoice number is already used in this sender profile, and leaves the invoice sequence unchanged
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Run the wave-2 pre-flight query on the target DB; record the duplicate-group count in the PR description
- [ ] Add `invoiceNumberKey String?` and `@@unique([senderProfileId, invoiceNumberKey])` — `prisma/schema/invoice.prisma`
- [ ] Promote 02, 03 and 04 into three consecutive `prisma/migrations/<ts>_…/migration.sql` folders (04 single statement)
- [ ] Apply locally, check `pg_index.indisvalid` for the new index, run `prisma migrate diff` (no drift)
- [ ] Apply downs in reverse (04 → 03 → 02) then ups again to confirm the pairs revert cleanly

## Edge cases

| Case | Behaviour |
|---|---|
| Pre-flight finds duplicate groups > 0 | Backfill leaves those rows `NULL`; index still builds; AC-17 path applies (T14) |
| Concurrent index build fails | INVALID index: `DROP INDEX CONCURRENTLY` and re-run 04 |
| Rollback to the previous build after migrating | Old code writes rows with `NULL` key; unique index tolerates them |

## Definition of Done

- [ ] staged migrations 02–04 are promoted to live `prisma/migrations/`, then apply and revert cleanly
- [ ] the pre-flight count is recorded and every row without a duplicate has a non-null key (`SELECT count(*) … WHERE "invoiceNumberKey" IS NULL`)
- [ ] the new unique index is valid (`indisvalid = true`)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
