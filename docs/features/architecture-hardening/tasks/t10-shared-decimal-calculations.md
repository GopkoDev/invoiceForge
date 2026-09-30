---
id: T10
title: "Make invoice-calculations a pure exact-decimal module shared by editor and server"
layer: "domain"
deps: ["T00"]
blocks: ["T11", "T13"]
acs: ["AC-13"]
files_hint: ["lib/helpers/invoice-calculations.ts", "store/invoice-editor-store/helpers.ts", "lib/actions/invoice-actions/helpers.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T10 — Make invoice-calculations a pure exact-decimal module shared by editor and server

## Place in the sequence

- **Blocked by:** — · **Blocks:** T11 — Tighten the invoice schema and add applyStatusChange for the paid date, T13 — Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`lib/actions/invoice-actions/helpers.ts`), T13 (`lib/actions/invoice-actions/helpers.ts`), T16 (`store/invoice-editor-store/helpers.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** the system to recompute and check every amount I save
> **So that** the totals on my PDFs and dashboard are always correct and never negative
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task makes "the editor showed X, the server stored Y" impossible, because both run the same rounding function.

## Inlined context

> "Editor showed X, server stored Y" becomes impossible by construction, because both run the same function. The module is pure: no Prisma and no server imports, since it ships in the browser bundle. Inputs and outputs are decimal strings or integer minor units, never floats. The PDF and the dashboard read the stored values.
>
> — `adr/0006, Decision outcome, abridged` · full text: [ADR-0006](../adr/0006-compute-invoice-amounts-in-one-shared-decimal-module.md)

> Stored amounts come only from the shared module (ADR-0006): `item.amount = roundHalfUp(quantity × price, 2)`, `subtotal = Σ amount`, `taxAmount = roundHalfUp((subtotal − discount + shipping) × taxRate / 100, 2)` (the tax base as today in `lib/helpers/invoice-calculations.ts`), `total = subtotal − discount + shipping + taxAmount`. Client-sent totals never reach the database.
>
> — `contracts/server-actions.md §Invoices, stored amounts, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Hard rule:** | Money | `Decimal(10,2)` at rest. All amounts are computed by **one pure exact-decimal module** shared by editor and server, rounding half-up. The server ignores client-sent totals |
>
> — `sad.md §8, row Money, verbatim` · full text: [sad.md](../sad.md)

Current state (code): `lib/helpers/invoice-calculations.ts` exports `calculateSubtotal`, `calculateTaxAmount`, `calculateTotal`, `calculateInvoiceTotals` on `number`; callers are `store/invoice-editor-store/helpers.ts` and `lib/actions/invoice-actions/helpers.ts`. No decimal library is a dependency — use integer cents (`BigInt` or safe integers ≤ 99 999 999.99 × 100) to stay dependency-free.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `InvoiceItem.amount` | DECIMAL(10,2) | NOT NULL | value rule: `round_half_up(quantity × rate, 2)` (written by T13/T14) |
| `Invoice.subtotal`, `taxAmount`, `total` | DECIMAL(10,2) | unchanged | value rule: recomputed by this module (written by T13/T14) |

— `data-model.md §Entities, Invoice + InvoiceItem, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-13 — happy

> **Given** a Freelancer saving an invoice with line items
> **When** the invoice is saved
> **Then** the system stores each line total as quantity × price rounded to 2 decimal places (half rounds up), whatever the browser sent; the subtotal is the sum of the rounded line totals, and the tax amount is rounded once. The editor uses the same rule, so the saved total equals the total the editor showed. If the browser sent different figures, the system's figures are stored and shown after saving, and the save is not blocked
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Rewrite the module on integer cents: `lineAmount(qty, price)`, `computeInvoiceAmounts({ items, discount, shipping, taxRate })` → `{ items[].amount, subtotal, taxAmount, total }` as `DecimalString`s (`"120.00"`), half-up rounding, pure (no imports from server code) — `lib/helpers/invoice-calculations.ts`
- [ ] Keep thin `number` adapters only where the editor store needs them for display, fed from the decimal results
- [ ] Switch the editor store to the new function so displayed totals come from it — `store/invoice-editor-store/helpers.ts`
- [ ] Switch the server helper to it (server write paths are wired in T13/T14) — `lib/actions/invoice-actions/helpers.ts`
- [ ] Sanity-check by hand in a scratch script: `1.005 × 1` → `1.01`, `0.1 × 3` → `0.30`, `33.335` half-up → `33.34`, discount = subtotal + shipping → total `0.00`

## Edge cases

| Case | Behaviour |
|---|---|
| Float artefacts (`0.1 + 0.2`) | Computed in cents; no float drift |
| Quantity with 2 dp × price with 2 dp | Exact product in 1/10 000, then one half-up rounding to cents |
| Browser-sent `items[].total` differs | Ignored; the module's figure wins (applied server-side in T13) |

## Definition of Done

- [ ] a scratch-script run over the listed cases matches hand-computed half-up results (recorded in the PR)
- [ ] editor totals in `pnpm dev` equal the module output for a multi-line invoice with discount, shipping and tax
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
