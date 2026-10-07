---
id: T09
title: "Apply every draft rule on draft saves and issuing from the editor, refreshing issued details only while the invoice is a draft"
layer: "app"
deps: ["T05", "T06", "T08"]
blocks: ["T10", "T16", "T21"]
acs: ["AC-02", "AC-11", "AC-12", "AC-14", "AC-15", "AC-19", "AC-20b", "AC-21b"]
files_hint: ["lib/services/invoices/invoices.ts", "tests/integration/services/invoices/update-draft-invoice.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T09 — Apply every draft rule on draft saves and issuing from the editor, refreshing issued details only while the invoice is a draft

## Place in the sequence

- **Blocked by:** T05 — Bound every computed amount, cap the discount and require due date ≥ issue date…, T06 — Check the bank account's and every catalogue line product's currency…, T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice… · **Blocks:** T10 — Decide list status changes and deletes under the row lock…, T16 — Render the editor in draft, issued and cancelled modes…, T21 — Prove every invoice write path enforces the same rules… · **Wave:** 4 — the draft branch sits inside the transaction T08 restructures.
- **Lane:** `lib/services/invoices/invoices.ts` lane (T01 → T07 → T08 → T09 → T10), serialized.

## Why (user story)

> **As a** Freelancer
> **I want** an issued invoice to keep the sender, Customer and bank details it was issued with
> **So that** re-opening or re-downloading it years later gives the document my Customer actually received
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** an invoice, its bank account and its catalogue products to share one currency
> **So that** my Customer is never asked to pay a EUR amount into a USD account
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** invoices to keep their lines when I deactivate or delete a product
> **So that** an invoice's lines and total never change just because I tidied up my product list
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** an amount that is too large, a due date before the issue date, or a malformed price to be explained on the field
> **So that** I know what to fix instead of seeing a generic failure
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the year in a system-assigned invoice number to be the year of the invoice's issue date
> **So that** an invoice dated in December is not numbered with next year
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task makes a draft save (and Save and issue) run every draft rule under the row lock and freeze the details of that last save.

## Inlined context

> `updateInvoice` writes the snapshot columns only when the invoice is a draft at the start of the save (issuing from the editor refreshes them in the same transaction, then freezes them).
>
> — `adr/0001-…, Decision outcome, abridged` · full text: [ADR-0001](../adr/0001-freeze-the-existing-snapshot-columns-at-issue-and-print-from-them.md)

> Flow 4 (after lock, freshness, cancelled and lifecycle): bank account currency differs → field error on the bank account; a catalogue product line in another currency, inactive products included → field error naming the line, free-text lines are not checked; an amount over 99,999,999.99, a discount over lines plus shipping, or a due date before the issue date → field errors, each amount checked on its own; every draft rule passes → refresh the issued details from the current sender profile, Customer and bank account, write fields and lines as sent, keep the number even if the issue date moved, version plus one, commit.
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> For `implement`: the order of the `alt` branches in flow 4 is the order checks run.
>
> — `sad.md §6, Notes from sequences, verbatim` · full text: [sad.md](../sad.md)

> **Hard rules:** never a generic `FAILED` for user input; lines are never removed automatically; every write scoped by owner, row locked.
>
> — `sad.md §8, Error handling; §4 Retired products, abridged` · full text: [sad.md](../sad.md)

Reuse: `verifyInvoiceRelations` currency checks (T06, `lib/services/invoices/helpers.ts`) and the draft-rule function from T05 (`lib/validations/invoice.ts`); snapshot builders `buildSenderSnapshot` / `buildCustomerSnapshot` / `buildBankAccountSnapshot` in `helpers.ts`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Columns | Rule | Change |
|---|---|---|
| issued details (`sender*`, `customer*`, `bank*`, `accountName`) | written from the current records while the row is `DRAFT` at the start of the save; never again once not `DRAFT` | written (draft only) |
| `invoiceNumber` / `invoiceNumberKey` | kept when the issue date moves later (AC-21b) | unchanged |
| `InvoiceItem` | written as sent; inactive-product lines kept | written (draft only) |
| `version` | `+ 1` | written |

— `data-model.md §Entities, Invoice "Existing columns whose meaning this feature fixes", abridged` · full text: [data-model.md](../data-model.md)

## API contract

`updateInvoice` step 7, **Draft** (`row.status = DRAFT`, including `data.status = PENDING`, which is issuing from the editor):
- Draft rules: bank-account currency → line-product currency (inactive included) → amount bounds and discount cap → due date, **all returned together** in one `VALIDATION` `fieldErrors`.
- Keys/messages: `bankAccountId` "This account is in {accountCurrency} while the invoice is in {invoiceCurrency}." · `items.<i>.productId` "“{productName}” is priced in {productCurrency} while the invoice is in {invoiceCurrency}." · `items.<i>.total` / `shipping` / `subtotal` / `taxAmount` / `total` "… can't exceed 99,999,999.99." · `discount` "Discount can't exceed the subtotal plus shipping." · `dueDate` "The due date can't be before the issue date ({issueDate})."
- Legacy checks from `architecture-hardening` (number move, shared number, `TOTALS_CHANGED`) run as before.
- Write: refresh issued details; fields and lines as sent; number kept when only the issue date moved; `version + 1`. When `data.status = PENDING` the refreshed details freeze (AC-02).

— `contracts/server-actions.md §updateInvoice step 7 + §Field-error messages, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-02 — happy path

> **Given** a Freelancer with a draft invoice for a Customer whose address they have just corrected
> **When** they save the draft
> **Then** the draft shows the corrected address. When they later issue it, from the editor or from the invoice list, the issued details saved with the draft at its last save become fixed and no longer change. A Customer, sender profile or bank account change made after the draft's last save reaches the invoice only if the draft is saved again before it is issued. The PDF of a draft prints the issued details from its last save
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — error

> **Given** a Freelancer editing a draft in EUR
> **When** they choose a bank account held in USD and save
> **Then** the system blocks the save and explains on the bank account field that the account is in USD while the invoice is in EUR
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — cross-context

> **Given** a Freelancer whose catalogue product "Consulting" is priced in USD
> **When** they save a EUR draft that has a "Consulting" line, from the editor or from any other path
> **Then** the system blocks the save and names the line whose product is in a different currency. Lines typed as free text, without a catalogue product, are not checked
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — cross-context

> **Given** an invoice issued before this release whose currency differs from its bank account's
> **When** the Freelancer changes its notes or due date and saves
> **Then** the save succeeds. On an issued invoice only the rules of the fields that actually changed are checked: a changed due date must not be before the issue date (AC-09), while the currency, amount and discount rules are not re-checked, because those fields are fixed. On a draft every rule, the currency rule included, is checked on every save and when it moves to pending from any path. A draft saved before this release with mismatching currencies is therefore blocked on its next save, even a notes-only one, and cannot be issued, with the explanation from AC-11, until the Freelancer fixes it
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — cross-context

> **Given** a draft and a paid invoice that each have a line for the product "Consulting 2025", which the Freelancer has since deactivated
> **When** the Freelancer opens either invoice, and saves the draft after changing its notes
> **Then** the line stays with its description, quantity, price, amount and custom-price marking exactly as they were saved, and the total is unchanged. No warning offers to remove it. "Consulting 2025" is not offered when adding new lines
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

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

### AC-21b — domain invariant

> **Given** a draft created on 28 December 2026 with issue date 28 December 2026 and system-assigned number INV-2026-0042
> **When** the Freelancer moves its issue date to 3 January 2027 and saves
> **Then** the number stays INV-2026-0042. The year is taken from the issue date only when the number is assigned, on the first save; a Freelancer who wants a different number types it by hand
>
> — `spec.md §5, AC-21b, verbatim` · full text: [spec.md](../spec.md)

(Service halves only; the editor's rendering is T16/T17.)

## Checklist

- [ ] `lib/services/invoices/invoices.ts` — `updateInvoice` draft branch, inside the T08 transaction after lifecycle: run T06 currency checks + T05 draft rules over the submitted values, merge into one `fieldErrors`, return `VALIDATION` before any write.
- [ ] On pass: refresh snapshot columns from the current records (only because `row.status = DRAFT`), write fields + lines as sent (no filtering of inactive-product lines), keep the number when only `issueDate` moved, `version + 1`, set `status = PENDING` when issuing.
- [ ] Remove any remaining server-side auto-removal of mismatching/inactive lines on save.
- [ ] `tests/integration/services/invoices/update-draft-invoice.test.ts` — AC-11, AC-12 (inactive USD product, free-text line unchecked), AC-19 (each amount, subtotal over limit with discount), AC-20b (1,250 refused, 1,200 accepted), AC-14 legacy draft notes-only save refused, AC-02 (save refreshes; issue freezes; later Customer change not reflected), AC-15, AC-21b.

## Edge cases

| Case | Behaviour |
|---|---|
| several draft rules fail at once | one `VALIDATION` with every key |
| line with `productId` null | currency not checked |
| product deactivated since the line was added, same currency | saved as sent |
| product deactivated, different currency | `items.<i>.productId` error (inactive still checked) |
| Save and issue with a failing rule | `VALIDATION`, still a draft, nothing stored |
| Customer edited after Save and issue | issued invoice unchanged |
| issue date moved into next year on a numbered draft | number unchanged |

## Definition of Done

- [ ] Integration tests show a draft save returns all failing draft rules together in one VALIDATION, a passing save refreshes the issued details and bumps version, Save with status PENDING freezes those details (a later Customer change does not reach the invoice), inactive-product lines are kept as sent, and a moved issue date keeps the number.
- [ ] Every existing test whose expectation changes is listed for the PR.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
