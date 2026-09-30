---
id: T13
title: "Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts"
layer: "app"
deps: ["T00", "T08", "T10", "T11", "T12"]
blocks: ["T14"]
acs: ["AC-06", "AC-07", "AC-08", "AC-09", "AC-10", "AC-12", "AC-13", "AC-14", "AC-15"]
files_hint: ["lib/actions/invoice-actions/invoice-actions.ts", "lib/actions/invoice-actions/helpers.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "L"   # justified: one save transaction must satisfy all nine numbering+amount ACs together; splitting create by AC would put two tasks on the same function
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T13 — Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts

## Place in the sequence

- **Blocked by:** T08 — Introduce typed ActionResult error codes and move every action onto them, T10 — Make invoice-calculations a pure exact-decimal module shared by editor and server, T11 — Tighten the invoice schema and add applyStatusChange for the paid date, T12 — Add normalizeInvoiceNumber and the row-locked allocateInvoiceNumber · **Blocks:** T14 — Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`lib/actions/invoice-actions/invoice-actions.ts`), T10 (`lib/actions/invoice-actions/helpers.ts`), T11 (`lib/actions/invoice-actions/invoice-actions.ts`), T14 (`lib/actions/invoice-actions/invoice-actions.ts`), T23 (`lib/actions/invoice-actions/invoice-actions.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** every invoice I save to get an invoice number that is unique within its sender profile, whether I keep the proposed number or type my own
> **So that** my numbering is continuous and a save never fails over a number I didn't choose
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the system to recompute and check every amount I save
> **So that** the totals on my PDFs and dashboard are always correct and never negative
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task makes every new invoice (typed, untouched or duplicated) get a unique number and server-computed, never-negative totals.

## Inlined context

> | Outcome | Result |
> |---|---|
> | number empty | allocate from the profile sequence under the row lock, skip keys taken by manual numbers, advance the counter (AC-06, AC-07, AC-09) → `success` |
> | number filled, key free in the profile | keep it; counter untouched (AC-10) → `success` |
> | number filled, key taken | `CONFLICT`, `fieldErrors.invoiceNumber`; rollback, counter untouched (AC-08) |
> | unique violation (P2002) on the key despite the lock (allocator bug backstop) | `CONFLICT` as above + a Sentry alert (sad §7) |
> | rule broken (AC-14, AC-15, AC-19) | `VALIDATION` + `fieldErrors`; nothing saved |
> | profile / customer / bank account not owned | `NOT_FOUND` |
> | `status = PAID` | `paidAt = now` |
>
> — `contracts/server-actions.md §createInvoice, outcomes, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> Flow 6, duplicate branch (AC-12). In one transaction: allocate from the original's sender-profile sequence (same allocator and format as create), insert the copy with recomputed amounts, `status = DRAFT`, `paidAt = null`. Outcomes: `UNAUTHORIZED`, `NOT_FOUND`, `FAILED`.
>
> — `contracts/server-actions.md §duplicateInvoice, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> Stored amounts come only from the shared module (ADR-0006): `item.amount = roundHalfUp(quantity × price, 2)`, `subtotal = Σ amount`, `taxAmount = roundHalfUp((subtotal − discount + shipping) × taxRate / 100, 2)` (the tax base as today in `lib/helpers/invoice-calculations.ts`), `total = subtotal − discount + shipping + taxAmount`. Client-sent totals never reach the database.
>
> — `contracts/server-actions.md §Invoices, stored amounts, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Hard rule:** | Invoice numbering | The number is unique within a sender profile on a **normalized key** (lower-case, trimmed). An empty field means system-assigned and is allocated under a profile row lock; a filled field is manual and never moves the sequence |
>
> — `sad.md §8, row Invoice numbering, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Money | `Decimal(10,2)` at rest. All amounts are computed by **one pure exact-decimal module** shared by editor and server, rounding half-up. The server ignores client-sent totals |
>
> — `sad.md §8, row Money, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Authorization | `getAuthenticatedUser()` (actions) or `requireSession()` (route handlers) runs **first, before any input is parsed**. Every query is scoped by `userId`. A record that isn't the caller's returns `NOT_FOUND`, identical to a missing one |
>
> — `sad.md §8, row Authorization, verbatim` · full text: [sad.md](../sad.md)

> Alerts (Sentry): any "number already used" on a system-assigned number (target 0 per month; it indicates an allocator bug)
>
> — `sad.md §7, Monitoring, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Invoice.invoiceNumber`, `invoiceNumberKey` | TEXT | key UNIQUE with `senderProfileId` | written on every insert |
| `Invoice.subtotal`, `taxAmount`, `total` | DECIMAL(10,2) | — | written from the shared module |
| `InvoiceItem.amount` | DECIMAL(10,2) | — | written from the shared module |
| `Invoice.paidAt` | TIMESTAMP(3) | NULL | from `applyStatusChange()` |

— `data-model.md §Entities, Invoice + InvoiceItem, abridged` · full text: [data-model.md](../data-model.md)

## API contract

> ```ts
> type SavedInvoice = {
>   id: string;
>   invoiceNumber: string;        // final number: as typed (manual) or allocated
>   subtotal: number; taxAmount: number; total: number;   // stored figures (AC-13)
>   status: InvoiceStatus;
>   paidAt: string | null;        // ISO; set by applyStatusChange() (AC-18)
> };
> ```
>
> — `contracts/server-actions.md §createInvoice, SavedInvoice, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

- `createInvoice(data: InvoiceFormValues): Promise<ActionResult<SavedInvoice>>`
- `duplicateInvoice(id): Promise<ActionResult<{ id: string; invoiceNumber: string }>>`

— `contracts/server-actions.md §createInvoice / §duplicateInvoice, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-06 — happy

> **Given** a Freelancer creating an invoice under a sender profile and leaving the invoice number field empty (the editor shows the proposed number only as a hint, "assigned on save")
> **When** the Freelancer saves the invoice
> **Then** the system assigns the next free number from that profile's invoice sequence at the moment of saving, advances the sequence, and shows the final number. An empty number field is the only signal that a number is system-proposed; any filled-in number is manual, even if it equals the hint
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a Freelancer with two editor tabs open for new invoices under the same sender profile, both showing the same proposed number as a hint and both with the number field left empty
> **When** both invoices are saved at about the same time
> **Then** both are saved, each with a different invoice number, and neither save fails
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a Freelancer who types an invoice number that is already used in the same sender profile, where two numbers count as the same if they match ignoring letter case and leading or trailing spaces (so "INV-001" and " inv-001 " are the same number)
> **When** the Freelancer saves the invoice
> **Then** the system blocks the save, says that this invoice number is already used in this sender profile, and leaves the invoice sequence unchanged
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a sender profile whose next proposed number was already taken by a manually typed invoice number
> **When** the Freelancer saves a new invoice without touching the number
> **Then** the system skips to the first free number, advances the sequence to it, and the Freelancer never sees an "already used" message
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — happy

> **Given** a Freelancer who saves an invoice with a manually typed number (including one equal to the proposed hint) that is not yet used in the sender profile
> **When** the invoice is saved
> **Then** the invoice keeps that number and the invoice sequence does not move
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — happy

> **Given** a Freelancer duplicating an existing invoice
> **When** the copy is created
> **Then** the copy gets a number from its sender profile's invoice sequence, in the same format as a newly created invoice
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy

> **Given** a Freelancer saving an invoice with line items
> **When** the invoice is saved
> **Then** the system stores each line total as quantity × price rounded to 2 decimal places (half rounds up), whatever the browser sent; the subtotal is the sum of the rounded line totals, and the tax amount is rounded once. The editor uses the same rule, so the saved total equals the total the editor showed. If the browser sent different figures, the system's figures are stored and shown after saving, and the save is not blocked
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** a Freelancer entering a line with a negative price or a quantity of zero or less, or a negative shipping amount, a negative discount, or a tax rate outside 0–100 %
> **When** the Freelancer saves the invoice
> **Then** the system blocks the save and shows next to the offending field or line that the price, shipping and discount can't be negative, the quantity must be greater than zero, and the tax rate must be between 0 and 100 %
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — domain invariant

> **Given** a Freelancer entering a discount (a fixed amount in the invoice currency) larger than the subtotal plus shipping
> **When** the Freelancer saves the invoice
> **Then** the system blocks the save and explains that the discount can't exceed the subtotal plus shipping, so an invoice total can never be negative; a discount exactly equal to the subtotal plus shipping is allowed and gives a total of zero
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `createInvoice`: guard → `invoiceFormSchema.safeParse` (no casts) → ownership of profile/customer/bank account → `prisma.$transaction`: empty number → `allocateInvoiceNumber`; filled → `isInvoiceKeyTaken` → `CONFLICT` with the contract message; recompute amounts; `applyStatusChange(DRAFT, status)`; insert with key — `lib/actions/invoice-actions/invoice-actions.ts`
- [ ] Catch P2002 on the key index → same `CONFLICT` + `Sentry.captureMessage('invoice_number_conflict', …)` when the number was system-assigned
- [ ] Return `SavedInvoice` with the stored figures
- [ ] `duplicateInvoice`: scoped load → transaction with the same allocator + recomputed amounts, `DRAFT`, `paidAt = null`
- [ ] Parallel-save probe: two browser tabs (or a scratch script calling the action) saving new invoices with empty numbers 20× — all succeed, distinct numbers

## Edge cases

| Case | Behaviour |
|---|---|
| Two tabs, both number fields empty, saved together (AC-07) | Both saved with different numbers |
| Manual "INV-001" when " inv-001 " exists (AC-08) | `CONFLICT` "This invoice number is already used in this sender profile."; counter unchanged |
| Manual number equal to the hint, still free (AC-10) | Kept; counter unchanged |
| Browser sends `items[].total` ≠ qty × price (AC-13) | Server figures stored and returned; save not blocked |
| Negative price / qty 0 / discount > subtotal + shipping | `VALIDATION` with field messages; nothing saved |
| Duplicating a PAID invoice (AC-12) | Copy is DRAFT, `paidAt` null, number from the profile sequence |

## Definition of Done

- [ ] in `pnpm dev`: empty number → allocated and shown; manual free → kept; manual taken (case/space variant) → blocked; counter unchanged for manual (AC-06, AC-08, AC-10)
- [ ] parallel probe: 20 pairs of concurrent empty-number saves all succeed with distinct numbers (AC-07); a manual number equal to the next candidate is skipped (AC-09)
- [ ] SQL after the probes: no row where `total < 0` or item `amount ≠ round_half_up(quantity × rate)` among new invoices (AC-13, AC-14, AC-15)
- [ ] duplicate produces a DRAFT copy numbered like a new invoice (AC-12)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
