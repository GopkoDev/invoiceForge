---
id: T08
title: "Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice and write only the four editable fields on issued invoices"
layer: "app"
deps: ["T02", "T03", "T04", "T05", "T07"]
blocks: ["T09", "T16", "T18", "T21"]
acs: ["AC-01", "AC-06", "AC-07", "AC-08", "AC-09", "AC-10", "AC-14"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/actions/invoice-actions/invoice-actions.ts", "tests/integration/actions/update-invoice.test.ts", "tests/integration/services/invoices/update-issued-invoice.test.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice and write only the four editable fields on issued invoices

## Place in the sequence

- **Blocked by:** T02 — Promote the four staged migrations…, T03 — Encode the status lifecycle as a transition table…, T04 — Add the pure locked-field comparison…, T05 — Bound every computed amount…, T07 — Create and duplicate invoices only as drafts… · **Blocks:** T09 — Apply every draft rule on draft saves…, T16 — Render the editor in draft, issued and cancelled modes…, T18 — Round-trip the loaded version…, T21 — Prove every invoice write path enforces the same rules… · **Wave:** 3 — needs `Invoice.version` (T02) and the three pure modules (T03, T04, T05).
- **Lane:** `lib/services/invoices/invoices.ts` lane (T01 → T07 → T08 → T09 → T10), serialized. The draft branch of `updateInvoice` is T09 — leave it behaving as today here.

## Why (user story)

> **As a** Freelancer
> **I want** an issued invoice to keep the sender, Customer and bank details it was issued with
> **So that** re-opening or re-downloading it years later gives the document my Customer actually received
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to change only the due date, notes, payment terms and PO number of an issued invoice, and to cancel and duplicate it for anything else
> **So that** small corrections stay easy while what I billed stays fixed
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a save from an outdated editor to be refused with an explanation
> **So that** marking an invoice paid in one tab is never undone by saving it in another
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task makes the one update path refuse stale, cancelled and locked-field saves, so an issued invoice can only change its four editable fields.

## Inlined context

> `updateInvoice` refuses with `CONFLICT` and the AC-10 message when the submitted `loadedVersion` differs from the locked row's, before any other rule runs. […] A successful save returns the new version so the editor's next save compares against it.
>
> — `adr/0004-…, Decision outcome, abridged` · full text: [ADR-0004](../adr/0004-detect-outdated-views-with-an-invoice-version-counter.md)

> Comparison uses the same normalizers as the write […]. A difference returns `VALIDATION` with the AC-08 explanation and a field error on each changed locked field; nothing is stored. With no difference, only the rules of the changed editable fields run (due date not before the issue date) and only those four columns, plus `version`, are written. A cancelled invoice refuses every change (AC-06).
>
> — `adr/0003-…, Decision outcome, abridged` · full text: [ADR-0003](../adr/0003-compare-locked-fields-in-one-update-path-and-refuse-any-difference.md)

> `updateInvoice` writes the snapshot columns only when the invoice is a draft at the start of the save.
>
> — `adr/0001-…, Decision outcome, abridged` · full text: [ADR-0001](../adr/0001-freeze-the-existing-snapshot-columns-at-issue-and-print-from-them.md)

> Flow 1: begin, lock the invoice row of this owner → not found → `NOT_FOUND`; loadedVersion differs → `CONFLICT`, changed elsewhere; a locked field differs → `VALIDATION`, only due date, notes, payment terms and PO number can change; due date before the issue date → `VALIDATION` on the due date; only editable fields changed → write the four editable fields, version plus one, commit.
>
> — `sad.md §6, Critical flow 1, abridged` · full text: [sad.md](../sad.md)

> **Hard rules:** every write scoped by owner in its own `WHERE`, the row lock included; another Freelancer's invoice is answered exactly like a missing one (AC-23). Never a generic `FAILED` for user input. Refusals are counted, not logged as errors; never log form bodies, issued details or bank data.
>
> — `sad.md §8, Authorization / Error handling / Logging, abridged` · full text: [sad.md](../sad.md)

Code today (commit 87862ef): `updateInvoice` at `lib/services/invoices/invoices.ts:540` reads the invoice outside the transaction, then locks `FOR UPDATE OF i` inside it; move the existence/owner read under the lock so every check runs on the locked row.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Invoice.version` | INTEGER | NOT NULL DEFAULT 0 | read (compared with `loadedVersion`), written `version + 1` |
| `dueDate`, `notes`, `paymentTerms`, `poNumber` | existing | — | the only columns written on an issued invoice |
| issued details, number, relations, `issueDate`, `currency`, amounts, `terms`, `InvoiceItem` | existing | — | read-only on `PENDING`/`OVERDUE`/`PAID`; `CANCELLED` refuses every edit |

— `data-model.md §Entities, Invoice, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`updateInvoice(id, data: InvoiceFormInput): Promise<ActionResult<SavedInvoice>>`, checks in order, first failure wins:
1. `UNAUTHORIZED` → shape `VALIDATION` (`loadedVersion` required, missing → `fieldErrors.loadedVersion = ["Reload the invoice and try again."]`).
2. Lock the row; none / foreign → `NOT_FOUND` "Invoice not found."
3. `loadedVersion ≠ row.version` → `CONFLICT`, "This invoice was changed elsewhere after you opened it. Reload it to see the latest version.", `details: { kind: 'CHANGED_ELSEWHERE', currentVersion }`.
4. `row.status = CANCELLED` → `VALIDATION`, "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.", `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'CANCELLED', suggestion: 'DUPLICATE' }`.
5. `data.status ≠ row.status` and the table refuses → `VALIDATION`, `fieldErrors.status`, `STATUS_NOT_ALLOWED` (messages shared with `updateInvoiceStatus`).
6. Issued: locked-field difference → `VALIDATION`, "An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.", `details: { kind: 'ISSUED_INVOICE_LOCKED' }`, one `fieldErrors` entry per changed key ("This field can't change on an issued invoice."); then only `dueDate ≥ issueDate` when `dueDate` changed ("The due date can't be before the issue date ({issueDate})."); write the four fields (+ `status`/`paidAt` if step 5 allowed) and `version + 1`. Legacy shared-number and `TOTALS_CHANGED` checks do not run.
7. Draft → T09. 8. `success` with `SavedInvoice.version` ★.

— `contracts/server-actions.md §updateInvoice, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-01 — happy path

> **Given** a Freelancer with a paid invoice issued last year
> **When** they change that sender profile's legal name, the Customer's address and the bank account's IBAN, then open the invoice, download its PDF, edit its notes and save
> **Then** the invoice and its PDF still show the old legal name, address and IBAN, and every field other than the notes is unchanged
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** a Freelancer with a cancelled invoice
> **When** they try to change its status, edit any field, or delete it
> **Then** the system refuses and tells them a cancelled invoice is final. The invoice keeps its number and stays in the list and printable. Duplicate is still offered
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy path

> **Given** a Freelancer with a pending invoice that became overdue yesterday
> **When** they move its due date to next week, add a note and save
> **Then** both changes are saved, the invoice is no longer counted as overdue, and its issued details, lines, amounts, issue date, currency and number are unchanged. An invoice the Freelancer marked overdue by hand stays overdue when its due date is moved into the future, until they move it back to pending themselves
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a Freelancer with an issued invoice
> **When** they try to change any field other than the due date, notes, payment terms and PO number, such as a line (its product, description, unit, quantity or price), the tax, the discount, the shipping, the terms, the issue date, the currency, the Customer, the sender profile, the bank account or the number
> **Then** the editor shows those fields as read-only. Any such change that reaches the system anyway is refused with the explanation that an issued invoice can only change its due date, notes, payment terms and PO number, and that cancelling and duplicating it is the way to correct it
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — error

> **Given** a Freelancer editing an issued invoice dated 10 March
> **When** they set its due date to 5 March and save
> **Then** the system blocks the save and shows on the due date field that it cannot be before the issue date, 10 March
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant (concurrent edge)

> **Given** a Freelancer has a pending invoice open in the editor, and marks it paid from the invoice list in another tab
> **When** they save from the editor that was opened before the payment
> **Then** the system refuses the save and tells them the invoice was changed elsewhere and must be reloaded. The invoice stays paid with its payment date, and nothing from the refused save is stored. The same refusal applies to drafts and to any change made elsewhere after the editor was opened, including a notes-only edit. A status change from the invoice list is not checked for freshness; it is accepted or refused by AC-04 against the invoice's current status, so marking paid an invoice that was cancelled elsewhere is refused as a change out of cancelled
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — cross-context

> **Given** an invoice issued before this release whose currency differs from its bank account's
> **When** the Freelancer changes its notes or due date and saves
> **Then** the save succeeds. On an issued invoice only the rules of the fields that actually changed are checked: a changed due date must not be before the issue date (AC-09), while the currency, amount and discount rules are not re-checked, because those fields are fixed. On a draft every rule, the currency rule included, is checked on every save and when it moves to pending from any path. A draft saved before this release with mismatching currencies is therefore blocked on its next save, even a notes-only one, and cannot be issued, with the explanation from AC-11, until the Freelancer fixes it
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

(The draft half of AC-14 is T09; the editor's read-only fields of AC-08 are T16; AC-01's PDF half is T14.)

## Checklist

- [ ] `lib/services/invoices/invoices.ts` — `updateInvoice`: shape parse only before the transaction; inside it lock the row by id + owner (`FOR UPDATE OF i`) and read status, version and every stored field + items; apply steps 2–6 in contract order.
- [ ] Freshness: compare `data.loadedVersion` with `row.version` before any other rule (also for drafts).
- [ ] Cancelled refusal, then `decideStatusChange` (T03) when `data.status ≠ row.status`.
- [ ] Issued branch: `compareLockedFields` (T04) → `ISSUED_INVOICE_LOCKED`; due-date rule from T05 only when `dueDate` changed; `update` only `dueDate`, `notes`, `paymentTerms`, `poNumber` (+ status/paidAt), `version: { increment: 1 }`; never touch snapshot columns or items; skip legacy number/`TOTALS_CHANGED` checks.
- [ ] Draft branch: keep current behaviour but add the version bump; T09 adds the draft rules.
- [ ] Return `version` in `SavedInvoice`; `lib/actions/invoice-actions/invoice-actions.ts` passes `loadedVersion` through.
- [ ] Tests: `tests/integration/services/invoices/update-issued-invoice.test.ts` (AC-01, AC-07, AC-08 per locked key, AC-09, AC-14 legacy currency, cancelled AC-06, order of checks); extend `tests/integration/actions/update-invoice.test.ts` for `CHANGED_ELSEWHERE` incl. notes-only race (AC-10) and `NOT_FOUND` for a foreign invoice.

## Edge cases

| Case | Behaviour |
|---|---|
| `loadedVersion` missing | `VALIDATION`, `fieldErrors.loadedVersion` |
| stale version **and** a locked-field change | `CONFLICT` wins (freshness runs first) |
| cancelled invoice, current version, notes-only change | `VALIDATION`, `suggestion: 'DUPLICATE'`, nothing stored |
| issued, unedited legacy instant on `issueDate` | counts as unchanged, save succeeds |
| issued, `dueDate` equal to `issueDate` | accepted |
| hand-marked `OVERDUE` with due date moved to the future | saved; status stays `OVERDUE` (AC-07) |
| issued invoice whose stored currency ≠ bank account's, notes edit | saved (AC-14) |
| two locked fields and a bad due date | `ISSUED_INVOICE_LOCKED` with both keys; due-date rule not reached |
| another Freelancer's invoice id | `NOT_FOUND` "Invoice not found." |

## Definition of Done

- [ ] Integration tests show updateInvoice checks in contract order (NOT_FOUND → CHANGED_ELSEWHERE → cancelled → lifecycle → locked fields → due date), stores nothing on any refusal, writes only dueDate/notes/paymentTerms/poNumber plus version+1 on an issued invoice (issued details, lines and amounts unchanged per AC-01/AC-07), saves a legacy currency-mismatched issued invoice's notes (AC-14), and returns the new version.
- [ ] Every existing test whose expectation changes is listed for the PR (NFR "Changed test expectations").
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
