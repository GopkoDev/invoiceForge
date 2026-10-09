---
id: T05
title: "Bound every computed amount, cap the discount and require due date ≥ issue date in the shared invoice schema"
layer: "domain"
deps: []
blocks: ["T07", "T08", "T09", "T10"]
acs: ["AC-09", "AC-19", "AC-20b"]
files_hint: ["lib/validations/invoice.ts", "tests/unit/invoice-validation.test.ts", "tests/unit/invoice-bounds.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T05 — Bound every computed amount, cap the discount and require due date ≥ issue date in the shared invoice schema

## Place in the sequence

- **Blocked by:** — · **Blocks:** T07 — Create and duplicate invoices only as drafts…, T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice…, T09 — Apply every draft rule on draft saves and issuing from the editor…, T10 — Decide list status changes and deletes under the row lock… · **Wave:** 1 — pure shared rules.
- **Lane:** own lane (`lib/validations/invoice.ts`).

## Why (user story)

> **As a** Freelancer
> **I want** an amount that is too large, a due date before the issue date, or a malformed price to be explained on the field
> **So that** I know what to fix instead of seeing a generic failure
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to change only the due date, notes, payment terms and PO number of an issued invoice, and to cancel and duplicate it for anything else
> **So that** small corrections stay easy while what I billed stays fixed
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task writes the amount, discount and date rules once, in the module the editor and the service both run.

## Inlined context

> **Amount and date bounds.** One shared zod module checks every amount from `computeInvoiceAmounts` (line amount, shipping, subtotal, tax amount, total, each on its own) against 99,999,999.99, caps the discount at lines plus shipping, and requires the due date not to be before the issue date. The editor runs the same module.
>
> — `sad.md §4, tactical "Amount and date bounds", abridged` · full text: [sad.md](../sad.md)

> **Where the rules run (ADR-0003, AC-14).** Before the transaction, the action parses the **shape only**: types, enums and calendar days. Every business rule in the table runs **inside** the save transaction, after the row lock, and only where AC-14 says so: **Draft** — every rule. **Issued** — only `dueDate ≥ issueDate`, and only when `dueDate` changed.
>
> — `contracts/server-actions.md §Shared input: InvoiceFormInput, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **Hard rule:** Validation — shared zod schemas in `lib/validations` run in the editor and in the service; amounts come from the shared decimal module and are bounded each on its own at 99,999,999.99. Never a generic `FAILED` for user input.
>
> — `sad.md §8, Validation + Error handling rows, abridged` · full text: [sad.md](../sad.md)

Design note for T07/T09/T10: so the service can run the rules over stored or submitted values inside its transaction, export them as plain functions (e.g. `checkDraftAmountRules(values)` and `checkDueDate(issueDate, dueDate)` returning `fieldErrors`), not only as a `superRefine` on the form schema. The current schema is in `lib/validations/invoice.ts` (server schema plus a client-only variant).

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [server-actions.md](../contracts/server-actions.md) ·
[adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

> | `loadedVersion` | `integer ≥ 0`. **Required by `updateInvoice`** (missing → `VALIDATION`, `fieldErrors.loadedVersion = ["Reload the invoice and try again."]`). Ignored by `createInvoice`. | ★ |
> | `issueDate`, `dueDate` | **New rule:** `dueDate ≥ issueDate` (same day allowed) | AC-09 |
> | computed amounts | each amount from `computeInvoiceAmounts` is checked on its own against `99 999 999.99`: every line `amount`, `subtotal`, `taxAmount`, `total`. `shipping` keeps its existing max | AC-19 |
> | `discount` | `≤ subtotal + shipping`. Equal is allowed. | AC-20b |
>
> | `dueDate` | "The due date can't be before the issue date ({issueDate})." The `{issueDate}` is in the app's display format, e.g. "10 Mar 2026" |
> | `items.<i>.total` | "The line amount can't exceed 99,999,999.99." |
> | `shipping` | "Shipping can't exceed 99,999,999.99." (✎ wording aligned) |
> | `subtotal` / `taxAmount` / `total` | "The subtotal can't exceed 99,999,999.99." / "The tax amount can't exceed 99,999,999.99." / "The total can't exceed 99,999,999.99." |
> | `discount` | "Discount can't exceed the subtotal plus shipping." |
>
> — `contracts/server-actions.md §Shared input: InvoiceFormInput + §Field-error messages, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-09 — error

> **Given** a Freelancer editing an issued invoice dated 10 March
> **When** they set its due date to 5 March and save
> **Then** the system blocks the save and shows on the due date field that it cannot be before the issue date, 10 March
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — error

> **Given** a Freelancer editing a draft
> **When** they enter 1,000 hours at 150,000 on one line, making the line amount, the subtotal, the tax amount, the shipping or the total larger than 99,999,999.99, and save
> **Then** the system blocks the save and shows that the amount cannot exceed 99,999,999.99: on the line for a line amount, on the shipping field for shipping, and on the totals for the subtotal, tax amount or total. Each of these amounts is checked on its own, so a subtotal over the limit is refused even when a discount brings the total back under it. Nothing is stored and no generic failure is shown
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-20b — error

> **Given** a Freelancer editing a draft whose lines add up to 1,000.00 with a shipping of 200.00
> **When** they enter a discount of 1,250.00 and save, from the editor or from any other path
> **Then** the system blocks the save and shows on the discount field that the discount cannot exceed the sum of the lines plus the shipping. A discount of 1,200.00 is accepted
>
> — `spec.md §5, AC-20b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `lib/validations/invoice.ts` — exported pure rule functions over `computeInvoiceAmounts` output (each amount on its own, keys above), discount cap, `dueDate ≥ issueDate`; wire them into the client schema too.
- [ ] Server update schema: `loadedVersion` required integer ≥ 0 (create ignores it).
- [ ] `tests/unit/invoice-bounds.test.ts` — AC-19 example (1,000 × 150,000), subtotal over / total under after discount, AC-20b 1,250 refused / 1,200 accepted, AC-09 5 Mar vs 10 Mar, same day allowed.
- [ ] `tests/unit/invoice-validation.test.ts` — update existing expectations (shipping wording) and note them for the PR.

## Edge cases

| Case | Behaviour |
|---|---|
| Amount exactly 99,999,999.99 | Accepted |
| Discount == lines + shipping | Accepted |
| Due date == issue date | Accepted |
| Several rules fail at once | All keys returned together |
| `loadedVersion` missing on update | `fieldErrors.loadedVersion` "Reload the invoice and try again." |

## Definition of Done

- [ ] Unit tests show the shared invoice rules return the contract messages under items.<i>.total, shipping, subtotal, taxAmount, total, discount and dueDate for the AC-19, AC-20b and AC-09 examples, each amount checked on its own, and the server schema requires loadedVersion as an integer ≥ 0 for updates.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
