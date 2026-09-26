---
id: T30
title: "Make invoiceNumberKey NOT NULL and drop the exact-match unique (contract step)"
layer: "migration"
deps: ["T00", "T07", "T14"]
blocks: []
acs: ["AC-08"]
files_hint: ["docs/features/architecture-hardening/migrations/05_set_invoice_number_key_not_null.up.sql", "docs/features/architecture-hardening/migrations/05_set_invoice_number_key_not_null.down.sql", "docs/features/architecture-hardening/migrations/06_drop_invoice_number_exact_unique.up.sql", "docs/features/architecture-hardening/migrations/06_drop_invoice_number_exact_unique.down.sql", "prisma/schema/invoice.prisma", "prisma/migrations/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T30 — Make invoiceNumberKey NOT NULL and drop the exact-match unique (contract step)

## Place in the sequence

- **Blocked by:** T07 — Add, backfill and uniquely index Invoice.invoiceNumberKey (expand step), T14 — Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals · **Blocks:** — · **Wave:** wave 4 — the rest (spec §1).
- **Lane:** shares files with T01 (`prisma/migrations/`), T07 (`prisma/schema/invoice.prisma`) — serialized by `implement`; `layer: migration` is always serialized in migration order.

## Why (user story)

> **As a** Freelancer
> **I want** every invoice I save to get an invoice number that is unique within its sender profile, whether I keep the proposed number or type my own
> **So that** my numbering is continuous and a save never fails over a number I didn't choose
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task finishes ADR-0004: once every invoice has a key, uniqueness rests on the normalized key alone.

## Inlined context

> **Hard rule:** | 4 | A8–A10, F3–F6 | contract step: `invoiceNumberKey` `NOT NULL`, only if no row has a `NULL` key (the ADR-0004 fallback was not taken) | applied only after wave 2 has run in production without a rollback; if the fallback was taken, the column stays nullable |
>
> — `sad.md §7, wave table row 4, verbatim` · full text: [sad.md](../sad.md)

> -- Before 05–06 (wave 4): must return 0, otherwise do not promote 05/06 (the column stays nullable, SAD §11 accepted debt).
> SELECT count(*) FROM "Invoice" WHERE "invoiceNumberKey" IS NULL;
>
> — `data-model.md §Pre-flight queries, wave 4, verbatim` · full text: [data-model.md](../data-model.md)

> `invoiceNumberKey` stays nullable between waves 2 and 4 (§7) for rollback safety, and stays nullable for good if the ADR-0004 fallback was taken (legacy duplicate rows keep a `NULL` key until renumbered).
>
> — `sad.md §11, Accepted debt, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column / index | Change |
|---|---|
| `Invoice.invoiceNumberKey` | NULL → NOT NULL (05) |
| `Invoice_senderProfileId_invoiceNumber_key` | dropped (06, `DROP INDEX CONCURRENTLY`, single statement) |

```prisma
// wave 4 (only if the pre-flight finds 0 NULL keys)
invoiceNumberKey String
// @@unique([senderProfileId, invoiceNumber])   // removed
@@unique([senderProfileId, invoiceNumberKey])
```

— `data-model.md §Entities Invoice + §Indexes, abridged` · full text: [data-model.md](../data-model.md)

Staged pairs: `05_set_invoice_number_key_not_null`, `06_drop_invoice_number_exact_unique` (`.up.sql` / `.down.sql`).

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

- [ ] Gate: wave 2 ran in production without rollback **and** the wave-4 pre-flight returns 0; otherwise close this task as "not applicable — fallback taken" and leave the column nullable
- [ ] Update the Prisma schema (`String`, remove the exact `@@unique`) — `prisma/schema/invoice.prisma`
- [ ] Promote 05 and 06 as two separate `prisma/migrations/<ts>_…` folders (06 single statement)
- [ ] Apply, `prisma migrate diff` (no drift), revert 06 → 05, re-apply

## Edge cases

| Case | Behaviour |
|---|---|
| Pre-flight returns > 0 | Do not promote; accepted debt (sad §11) |
| 05 applied with a NULL row present | Statement fails; migration applies nothing |

## Definition of Done

- [ ] pre-flight result recorded; if 0, staged migrations 05–06 are promoted to live `prisma/migrations/`, then apply and revert cleanly with no drift
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
