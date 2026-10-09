---
id: T07
title: "Create and duplicate invoices only as drafts under the draft rules, numbered by the issue date's year"
layer: "app"
deps: ["T01", "T02", "T03", "T05", "T06"]
blocks: ["T08", "T15", "T21"]
acs: ["AC-04b", "AC-06", "AC-21", "AC-22"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/services/invoices/numbering.ts", "lib/actions/invoice-actions/invoice-actions.ts", "tests/integration/actions/create-and-duplicate-invoice.test.ts", "tests/unit/services/numbering-year.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T07 — Create and duplicate invoices only as drafts under the draft rules, numbered by the issue date's year

## Place in the sequence

- **Blocked by:** T01 — Sentry spans (invoices.ts lane), T02 — Promote the four staged migrations…, T03 — Encode the status lifecycle…, T05 — Bound every computed amount…, T06 — Check the bank account's and every catalogue line product's currency… · **Blocks:** T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice…, T15 — Offer only lifecycle-allowed row actions…, T21 — Prove every invoice write path enforces the same rules… · **Wave:** 2 — first service task on the new rules.
- **Lane:** invoices.ts lane (T01 → T07 → T08 → T09 → T10, serialized).

## Why (user story)

> **As a** Freelancer
> **I want** only sensible status changes to be accepted
> **So that** a paid or cancelled invoice cannot be rewound into a draft, deleted, or silently lose its payment date
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the year in a system-assigned invoice number to be the year of the invoice's issue date
> **So that** an invoice dated in December is not numbered with next year
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task makes every new invoice — created or duplicated — start as a valid draft whose number carries its issue date's year.

## Inlined context

> Flow 3: alt requested status is not draft → refused, a new invoice always starts as a draft … else status draft → read the sender profile, Customer, bank account and line products of this owner (inactive products included) → a referenced record missing or another Freelancer's → not found → a draft rule fails, currency, amount bounds, discount cap or due date → field errors → every draft rule passes → lock the sender profile row, read its invoice sequence → when no number was typed, take the year from the issue date calendar day, not the server clock → write the draft with the current records as issued details, lines, version 0, advance the sequence, commit. Duplicate always sends draft, a duplicate carries no reference to its source.
>
> — `sad.md §6, flow 3, abridged` · full text: [sad.md](../sad.md)

> **Numbering year.** `formatInvoiceNumber` takes the year from the invoice's issue date — the calendar day stored at `T00:00:00Z` (mcp-server ADR-0009), read by its UTC year — instead of the server clock. The number is still assigned on first save, the counter is not reset per year, and a later issue-date change keeps the number.
>
> — `sad.md §4, tactical "Numbering year", verbatim` · full text: [sad.md](../sad.md)

> `duplicateInvoice` copies from the current records, because the duplicate is a new draft.
>
> — `adr/0001-…, Decision outcome, abridged` · full text: [ADR-0001](../adr/0001-freeze-the-existing-snapshot-columns-at-issue-and-print-from-them.md)

> **Hard rule:** never a generic `FAILED` for user input; another Freelancer's record → `NOT_FOUND` identical to a missing one; every invoice service write sets `version` (create starts at 0).
>
> — `sad.md §8, Error handling + Authorization rows; data-model.md §Invoice version, abridged` · full text: [sad.md](../sad.md)

Current code: `formatInvoiceNumber(prefix, n)` uses `new Date().getFullYear()` (`lib/services/invoices/numbering.ts:29`); `createInvoice` `invoices.ts:352`, `duplicateInvoice` `:856` (today copies the source snapshot and may return `FAILED`). Use T03's `decideCreateStatus`, T05's draft rules, T06's currency check.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Invoice.version` | INTEGER | NOT NULL DEFAULT 0 | written 0 on create/duplicate |
| issued details (`sender*`, `customer*`, `bank*`, `accountName`) | existing | — | copied from the **current** records on create and duplicate |
| `invoiceNumber` / `invoiceNumberKey` | existing | UNIQUE (`senderProfileId`, `invoiceNumberKey`) | year = UTC year of `issueDate` |
| `SenderProfile.invoiceCounter` | existing | — | advanced under its row lock, never reset per year |

— `data-model.md §Invoice + §SenderProfile, abridged` · full text: [data-model.md](../data-model.md)

## API contract

> `createInvoice` — 3: `status ≠ DRAFT` → `VALIDATION`, `error` = the `status` message, `fieldErrors.status`, `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'DRAFT', suggestion: null }`. Nothing is stored · 4: sender profile, Customer, bank account or a line's product missing or foreign → `NOT_FOUND` · 5: a draft rule fails → `VALIDATION` + `fieldErrors` · 6: number empty → allocated under the sender-profile row lock; **the year is the UTC year of `issueDate`** · 7: success → issued details copied from the current records; `version = 0`; `paidAt = null`.
>
> `duplicateInvoice` — works for a source in **any** status, `CANCELLED` included. The copy is always `DRAFT` with `paidAt = null` and `version = 0`, no reference to its source. Issued details copied from the **current** sender profile, Customer and bank account. The duplicate goes through the create rules; a failure returns **`VALIDATION`** (was `FAILED`), `error` = "This invoice can't be duplicated. {reasons}" (de-duplicated field messages), `fieldErrors` keyed as in the editor; not reported to Sentry. Number: year of the copy's issue date (today in the Freelancer time zone).
>
> `generateInvoiceNumber` (hint): year from today's calendar day in the Freelancer time zone.
>
> — `contracts/server-actions.md §createInvoice + §duplicateInvoice + §Unchanged here, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-04b — domain invariant

> **Given** a Freelancer creating a new invoice or duplicating an existing one, from the editor or from any other path
> **When** the new invoice is saved with any status other than draft
> **Then** the system refuses and explains that a new invoice always starts as a draft and is issued by moving it to pending. A duplicate is always created as a draft
>
> — `spec.md §5, AC-04b, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** a Freelancer with a cancelled invoice
> **When** they try to change its status, edit any field, or delete it
> **Then** the system refuses and tells them a cancelled invoice is final. The invoice keeps its number and stays in the list and printable. Duplicate is still offered
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

(This task owns "Duplicate is still offered" at the service; refusals are T08/T10.)

### AC-21 — happy path

> **Given** a Freelancer whose last system-assigned number for a sender profile was INV-2026-0041
> **When** on 2 January 2027 they create an invoice with issue date 28 December 2026
> **Then** it is numbered INV-2026-0042, and the next invoice dated in 2027 gets INV-2027-0043
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — cross-context

> **Given** a Freelancer in the Kyiv time zone at 00:30 on 1 January 2027, while it is still 31 December 2026 in UTC
> **When** they create an invoice with issue date 1 January 2027
> **Then** its system-assigned number carries 2027, because the year comes from the issue date, not from the system's clock
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `lib/services/invoices/numbering.ts` — `formatInvoiceNumber(prefix, n, issueDate)` takes `issueDate.getUTCFullYear()`; update every caller.
- [ ] `lib/services/invoices/invoices.ts` `createInvoice` — `decideCreateStatus` first; then relations/currency (T06), draft rules (T05); write `version: 0`.
- [ ] `duplicateInvoice` — any source status; copy issued details from current records; run create rules; failures → `VALIDATION` with joined reasons, no `captureException`.
- [ ] `lib/actions/invoice-actions/invoice-actions.ts` — `generateInvoiceNumber` hint year from today in the Freelancer time zone; actions unchanged otherwise.
- [ ] `tests/unit/services/numbering-year.test.ts` — AC-21 and AC-22 instants under a fake clock.
- [ ] `tests/integration/actions/create-and-duplicate-invoice.test.ts` — non-draft create refused per status; duplicate of cancelled → draft, version 0, current issued details; legacy mismatching source → `VALIDATION`.

## Edge cases

| Case | Behaviour |
|---|---|
| Manually typed number | Kept; taken key → existing `CONFLICT` (unchanged) |
| Create with status omitted | Defaults to `DRAFT` |
| Duplicate of a source whose bank account is now in another currency | `VALIDATION` "This invoice can't be duplicated. …", nothing stored |
| Duplicate of a foreign invoice | `NOT_FOUND` |
| Counter crosses a year | Not reset (INV-2027-0043 after INV-2026-0042) |

## Definition of Done

- [ ] Integration tests show createInvoice refuses every non-draft status with the AC-04b message and stores nothing, a cancelled invoice duplicates into a draft with version 0 and current issued details, a failing duplicate returns VALIDATION (never FAILED), and the AC-21/AC-22 numbers carry the issue date's year.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
