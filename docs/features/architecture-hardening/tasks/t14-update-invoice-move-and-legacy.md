---
id: T14
title: "Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals"
layer: "app"
deps: ["T00", "T13"]
blocks: ["T16", "T23", "T26", "T30"]
acs: ["AC-11", "AC-17", "AC-18"]
files_hint: ["lib/actions/invoice-actions/invoice-actions.ts", "lib/actions/invoice-actions/select-queries.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T14 — Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals

## Place in the sequence

- **Blocked by:** T13 — Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts · **Blocks:** T16 — Build the editor number hint, field errors, saved state, legacy alert and SCR-15 dialog, T23 — Parse invoice-list link parameters with fallback defaults and inclusive local date ranges, T26 — Route page load outcomes: FAILED to the error boundary, NOT_FOUND to not-found, T30 — Make invoiceNumberKey NOT NULL and drop the exact-match unique (contract step) · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`lib/actions/invoice-actions/invoice-actions.ts`), T11 (`lib/actions/invoice-actions/invoice-actions.ts`), T13 (`lib/actions/invoice-actions/invoice-actions.ts`), T23 (`lib/actions/invoice-actions/invoice-actions.ts`) — serialized by `implement`.

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

This task makes editing an existing invoice follow the same number and amount rules as a new one, including a move to another sender profile and the first save of a legacy invoice.

## Inlined context

> 1. `UNAUTHORIZED` → `VALIDATION` (schema) → `NOT_FOUND` (invoice, or new relations not owned).
> 2. **Move (AC-11):** if `senderProfileId` changed, the editor has already cleared the number field. Empty → allocate from **B's** sequence; typed → manual rules in B. A's counter is never touched.
> 3. **Number:** if the normalized key equals the invoice's own current key and the profile is unchanged → keep it. Otherwise → the manual rules of `createInvoice` (`CONFLICT` if taken).
> 4. **Legacy shared number (AC-17):** the invoice's key is `NULL` or shared with another invoice in the profile, and the number is unchanged → `CONFLICT`, `fieldErrors.invoiceNumber = ["This invoice number is also used by another invoice. Change it to a free one to save."]`.
> 5. **Legacy totals (AC-17, flow 7):** the recomputed `total` ≠ the stored `total`:
>    - without `confirmedTotals`, or with values that no longer equal (stored, recomputed) → `CONFLICT`, `details: { kind: 'TOTALS_CHANGED', oldTotal, newTotal }`, `error: "The total of this invoice changes from {oldTotal} to {newTotal}. Confirm to save."`. Nothing saved; the UI opens SCR-15.
>    - with `confirmedTotals` equal to both → saved.
> 6. **Status (AC-18, AC-19):** `applyStatusChange(prev, next)`: entering `PAID` → `paidAt = now`; `PAID → PAID` → unchanged; leaving `PAID` → `null`.
>
> — `contracts/server-actions.md §updateInvoice, check order, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> ```ts
> legacy: {
>   storedTotal: DecimalString;       // Invoice.total
>   recomputedTotal: DecimalString;   // shared module over the stored lines
>   sharedNumber: boolean;            // key NULL, or another invoice in the profile has the same normalized key
> } | null                            // null when nothing differs and the number is free
> ```
>
> — `contracts/server-actions.md §getInvoiceEditorData / getInvoice, legacy flags, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> AC-17 shared-number flag on a legacy row (key NULL): `WHERE "senderProfileId" = $1 AND id <> $2` with the number normalized in app → `Invoice_senderProfileId_idx` (existing; a profile holds tens to hundreds of invoices).
>
> — `data-model.md §Entities, Invoice access patterns, verbatim` · full text: [data-model.md](../data-model.md)

> Postcondition: an invoice never keeps A's number under B unless it was typed and is free in B
>
> — `sad.md §6, flow 6 postcondition, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Invoice numbering | The number is unique within a sender profile on a **normalized key** (lower-case, trimmed). An empty field means system-assigned and is allocated under a profile row lock; a filled field is manual and never moves the sequence |
>
> — `sad.md §8, row Invoice numbering, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Status and paid date | **One transition function**, `applyStatusChange()`: entering Paid sets `paidAt` to now; saving an already-Paid invoice keeps it; leaving Paid clears it; an unknown status is rejected |
>
> — `sad.md §8, row Status and paid date, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Invoice.senderProfileId` | TEXT | FK Restrict | written on move |
| `Invoice.invoiceNumber`, `invoiceNumberKey` | TEXT | key UNIQUE with `senderProfileId` | written (every save writes a non-null key) |
| `Invoice` amounts + `InvoiceItem.amount` | DECIMAL | — | recomputed on save |
| `SenderProfile.invoiceCounter` (B only) | INTEGER | — | incremented when allocating on move |

— `data-model.md §Entities, Invoice + SenderProfile, abridged` · full text: [data-model.md](../data-model.md)

## API contract

> ```json
> { "success": false, "code": "CONFLICT",
>   "error": "The total of this invoice changes from 120.00 to 119.99. Confirm to save.",
>   "details": { "kind": "TOTALS_CHANGED", "oldTotal": "120.00", "newTotal": "119.99" } }
> ```
>
> — `contracts/server-actions.md §updateInvoice, example, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

- `updateInvoice(id, data: InvoiceFormValues & { confirmedTotals? }): Promise<ActionResult<SavedInvoice>>`; `getInvoiceEditorData` / `getInvoice` gain `invoice.legacy`.

## Acceptance criteria

### AC-11 — cross-context

> **Given** a Freelancer moving an existing invoice from sender profile A to sender profile B
> **When** the Freelancer saves the change
> **Then** the invoice number field is cleared and the same rules as for a new invoice in B apply: left empty, the invoice gets a number from B's invoice sequence and B's sequence advances (AC-06, AC-09); filled in, it is a manual number (AC-08, AC-10). A's invoice sequence does not change, and A's old number is not proposed again. The invoice never keeps A's number under B unless the Freelancer types it and it is free in B
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — cross-context

> **Given** an invoice saved before this change whose stored total differs from the recomputed total, whose amounts break the rules above, or whose invoice number is also used by another invoice in the same sender profile
> **When** the Freelancer edits and saves it in the editor
> **Then** the system shows the old and new totals and asks for confirmation before saving; an invoice whose amounts break the rules can't be saved until they are corrected; and an invoice with a shared number can be opened and viewed but can't be saved until its number is changed to a free one. A status change from the invoice list does not touch amounts or number and is never blocked by these checks
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — happy

> **Given** a Freelancer setting an invoice's status to Paid from another status, from the invoice list or by saving it in the editor
> **When** the change is saved
> **Then** the system records the moment of that change as the paid date; saving an invoice that is already Paid again leaves its paid date unchanged
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Compute `legacy` in `getInvoiceEditorData` and `getInvoice` (stored vs recomputed total; shared-number check by normalized key) — `lib/actions/invoice-actions/invoice-actions.ts`, `select-queries.ts`
- [ ] `updateInvoice`: implement the six-step order above inside one transaction; allocation on move uses B's allocator only
- [ ] Compare `confirmedTotals` against (stored, recomputed) as exact `DecimalString`s
- [ ] Write `invoiceNumberKey` on every successful save; recompute amounts; replace items as today
- [ ] Manual check on the dev DB: seed a legacy invoice (edit `total` by SQL), open + save → `TOTALS_CHANGED`; resubmit with the echoed figures → saved

## Edge cases

| Case | Behaviour |
|---|---|
| Move A → B, number left empty | Number from B's sequence; A's counter unchanged |
| Move A → B, typed A's old number, free in B | Kept as manual in B; B's counter unchanged |
| Legacy invoice with NULL key, number unchanged | `CONFLICT` shared-number message |
| Legacy totals, confirmation echoes stale figures | `CONFLICT` `TOTALS_CHANGED` again with fresh figures |
| Legacy invoice with rule-breaking amounts | `VALIDATION` first (schema step precedes legacy checks) |
| Saved in editor as PAID again | `paidAt` unchanged (AC-18) |

## Definition of Done

- [ ] in `pnpm dev`: moving an invoice to B with an empty number assigns from B and leaves A's counter as it was (AC-11)
- [ ] a seeded legacy invoice: shared number blocks save with the contract text; changed totals return `TOTALS_CHANGED` and save only with matching `confirmedTotals` (AC-17)
- [ ] saving an already-Paid invoice keeps `paidAt` (AC-18)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
