---
id: T11
title: "Tighten the invoice schema and add applyStatusChange for the paid date"
layer: "domain"
deps: ["T00", "T08", "T10"]
blocks: ["T13"]
acs: ["AC-14", "AC-15", "AC-18", "AC-19"]
files_hint: ["lib/validations/invoice.ts", "lib/helpers/invoice-status.ts", "lib/actions/invoice-actions/invoice-actions.ts", "components/invoices/invoice-row-actions.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T11 — Tighten the invoice schema and add applyStatusChange for the paid date

## Place in the sequence

- **Blocked by:** T08 — Introduce typed ActionResult error codes and move every action onto them, T10 — Make invoice-calculations a pure exact-decimal module shared by editor and server · **Blocks:** T13 — Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`lib/actions/invoice-actions/invoice-actions.ts`), T13 (`lib/actions/invoice-actions/invoice-actions.ts`), T14 (`lib/actions/invoice-actions/invoice-actions.ts`), T23 (`lib/actions/invoice-actions/invoice-actions.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** the system to recompute and check every amount I save
> **So that** the totals on my PDFs and dashboard are always correct and never negative
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the paid date to follow the invoice's status
> **So that** my payment history and dashboard reflect reality
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task encodes the amount rules and the status→paid-date rule once, so every save path (T13, T14) and the list status change enforce the same thing.

## Inlined context

> | Field | Type / rule | Change | AC |
> |---|---|---|---|
> | `invoiceNumber` | `string`, trimmed. **Empty (`''` or whitespace only) = system-assigned**; anything else is manual | ✎ was `min(1)` | AC-06, AC-10 |
> | `status` | `enum InvoiceStatus` = `DRAFT \| PENDING \| PAID \| OVERDUE \| CANCELLED`. Unknown → `VALIDATION` "Unknown status" | message ✎ | AC-19 |
> | `items[].quantity` | `number > 0`, ≤ 99 999 999.99, 2 dp | ★ max | AC-14 |
> | `items[].price` | `number ≥ 0`, ≤ 99 999 999.99, 2 dp | ★ max | AC-14 |
> | `items[].total` | **ignored by the server**. Kept in the type for the editor only | ✎ | AC-13 |
> | `taxRate` | `0 ≤ n ≤ 100`, 2 dp | — | AC-14 |
> | `shipping` | `number ≥ 0`, ≤ 99 999 999.99 | ★ max | AC-14 |
> | `discount` | `number ≥ 0` **and ≤ subtotal + shipping** (recomputed). Equal is allowed → total 0 | ★ cap | AC-15 |
> | `confirmedTotals` | `{ oldTotal: DecimalString; newTotal: DecimalString }`, optional, **update only** | ★ | AC-17 |
>
> — `contracts/server-actions.md §Invoices, Shared input InvoiceFormValues, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> | `fieldErrors` key | Message |
> |---|---|
> | `invoiceNumber` | "This invoice number is already used in this sender profile." |
> | `items.<i>.price` | "Price can't be negative." |
> | `items.<i>.quantity` | "Quantity must be greater than zero." |
> | `shipping` | "Shipping can't be negative." |
> | `discount` | "Discount can't be negative." / "Discount can't exceed the subtotal plus shipping." |
> | `taxRate` | "Tax rate must be between 0 and 100 %." |
> | `status` | "Unknown status." |
>
> — `contracts/server-actions.md §Invoices, Field-error messages, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Hard rule:** | Status and paid date | **One transition function**, `applyStatusChange()`: entering Paid sets `paidAt` to now; saving an already-Paid invoice keeps it; leaving Paid clears it; an unknown status is rejected |
>
> — `sad.md §8, row Status and paid date, verbatim` · full text: [sad.md](../sad.md)

> ### `updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<ActionResult<{ status: InvoiceStatus; paidAt: string | null }>>` ✎
>
> Flow 8, list branch. Touches **only** `status` and `paidAt`. It never runs the amount, number or legacy checks (AC-17 last sentence). Outcomes: `UNAUTHORIZED`; `VALIDATION` (`status` is not in the enum, AC-19); `NOT_FOUND`; `success` with the result of `applyStatusChange()`.
>
> — `contracts/server-actions.md §updateInvoiceStatus, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> | `paidAt` | TIMESTAMP(3) | NULL (unchanged) | rule moves to `applyStatusChange()`: set on entering `PAID`, kept on re-save, cleared on leaving (AC-18, AC-19). No DB rule, per the repo's no-CHECK convention |
>
> — `data-model.md §Entities, Invoice paidAt row, verbatim` · full text: [data-model.md](../data-model.md)

> | `status-changed` | Row status changed. The row's `Badge` and paid date update from the result (AC-18, AC-19; flow 8). Never blocked by legacy checks (AC-17) | `Badge`, `toast.success` | wireframe below |
> | status-rejected | `updateInvoiceStatus` → `VALIDATION` (tampered status): `toast.error` "Unknown status." (AC-19) | `Sonner` | — |
>
> — `screens.md §SCR-02, status rows, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** | Input validation | Every action re-runs the entity's zod schema, **with no `as` casts that bypass it** (L8). **Link parameters are parsed with fallback-to-default schemas**: page ≥ 1, page size ∈ {10, 20, 30, 50, 100} (the sizes the list offers, `components/invoices/invoices-table-footer.tsx:29`), sort field, order, status and tab from enums; anything invalid becomes its default, and the controls show what was applied |
>
> — `sad.md §8, row Input validation, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Invoice.status` | `InvoiceStatus` enum | NOT NULL DEFAULT `DRAFT` | read + written (list status change) |
| `Invoice.paidAt` | TIMESTAMP(3) | NULL | written by `applyStatusChange()` |

— `data-model.md §Entities, Invoice, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `updateInvoiceStatus(id, status)` → `ActionResult<{ status; paidAt: string | null }>`; `VALIDATION` "Unknown status." on a non-enum value.

— `contracts/server-actions.md §updateInvoiceStatus, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

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

### AC-18 — happy

> **Given** a Freelancer setting an invoice's status to Paid from another status, from the invoice list or by saving it in the editor
> **When** the change is saved
> **Then** the system records the moment of that change as the paid date; saving an invoice that is already Paid again leaves its paid date unchanged
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — domain invariant

> **Given** a Paid invoice
> **When** the Freelancer changes its status to anything other than Paid
> **Then** the paid date is cleared, and a status the product doesn't know is rejected with a plain-language message
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Update `invoiceFormSchema`: `invoiceNumber` trimmed, empty allowed; ranges + maxes + messages per the table; `status` enum with "Unknown status."; `discount ≤ subtotal + shipping` as a `superRefine` using T10's module; optional `confirmedTotals` — `lib/validations/invoice.ts`
- [ ] Add `applyStatusChange(prev: { status; paidAt }, next: InvoiceStatus, now = new Date())` → `{ status, paidAt }` — `lib/helpers/invoice-status.ts`
- [ ] Rewrite `updateInvoiceStatus`: guard → `z.nativeEnum(InvoiceStatus)` → scoped load → `applyStatusChange` → update only `status`/`paidAt` — `lib/actions/invoice-actions/invoice-actions.ts`
- [ ] List row: update the `Badge` + paid date from the result; `VALIDATION` → `toast.error(result.error)` — `components/invoices/invoice-row-actions.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Discount exactly subtotal + shipping | Allowed; total `0.00` (AC-15) |
| PAID → PAID from the list | `paidAt` unchanged (AC-18) |
| PAID → PENDING | `paidAt = null` (AC-19) |
| Tampered status `"FOO"` | `VALIDATION` "Unknown status.", nothing saved |
| List status change on a legacy invoice with bad totals | Allowed; amounts and number untouched (AC-17 last sentence) |

## Definition of Done

- [ ] `applyStatusChange` verified in a scratch run for DRAFT→PAID (sets), PAID→PAID (keeps), PAID→PENDING (clears), FOO (rejected) (AC-18, AC-19)
- [ ] schema rejects each AC-14/AC-15 case with the contract message and accepts discount = subtotal + shipping (scratch `safeParse` run)
- [ ] list status change in `pnpm dev` updates badge and paid date
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
