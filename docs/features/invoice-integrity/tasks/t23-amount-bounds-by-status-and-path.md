---
id: "T23"
title: "Apply the amount bounds by status and path: shape only on issued saves, every bound on draft saves and on issuing from the list, discount capped at the column limit"
layer: "app"
deps: ["T22"]
blocks: ["T26", "T32"]
acs: ["AC-14", "AC-19", "AC-20b", "AC-25"]
files_hint: ["lib/validations/invoice.ts", "lib/services/invoices/invoices.ts", "lib/services/invoices/helpers.ts", "tests/unit/invoice-bounds.test.ts", "tests/integration/services/invoices/update-issued-invoice.test.ts", "tests/integration/services/invoices/update-invoice-status.test.ts", "tests/integration/services/invoices/write-path-conformance.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T23 — Apply the amount bounds by status and path: shape only on issued saves, every bound on draft saves and on issuing from the list, discount capped at the column limit

## Place in the sequence

- **Blocked by:** T22 — Refresh the issued details in the editor after Save and issue and never offer a picker on an issued invoice · **Blocks:** T26, T32 · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review findings F2, F3 and F6: the per-field amount bounds run where AC-14 says they must not (issued rows), are skipped where AC-14/AC-25 say they must run (list issue), and the discount can overflow `Decimal(10,2)` into a generic failure.

## Inlined context

> F2: `invoiceUpdateFormSchema.safeParse` (`invoices.ts:625`, before the row lock) applies `price.min(0)`, `quantity.gt(0)`, `taxRate.max(100)` and the 2-dp rules to the locked lines, tax and shipping of an issued invoice. A pre-release issued invoice breaking them gets `VALIDATION items.0.price` under a disabled field. Contract "Where the rules run": "shape only: types, enums and calendar days … A legacy issued invoice that breaks them still saves its notes".
> F3: draft → pending from the list (`invoices.ts:986-996`) runs only `checkDraftRules` over `transformInvoiceToFormData`; the editor's Save and issue also runs the shape bounds. `duplicateInvoice` already re-checks them (`:1052-1053`).
> F6: `discountSchema` (`lib/validations/invoice.ts:166-169`) has no max; the cap is subtotal + shipping, so e.g. subtotal 60,000,000 + shipping 50,000,000 + discount 100,000,000 passes every bound and the write overflows → `FAILED`.
>
> — `_review/review-2026-10-08.md F2, F3, F6, abridged`

> On an issued invoice only the rules of the fields that actually changed are checked … On a draft every rule, the currency rule included, is checked on every save and when it moves to pending from any path.
>
> — `spec.md §5 AC-14, abridged`

> **Hard rule:** 0 generic failures for amount, date, price, discount or currency input; each comes back as a field error.
>
> — `spec.md §6 NFR, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-14, AC-19, AC-20b, AC-25. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] Split the update input parse: types/enums/calendar days only before the lock; the per-field amount bounds move to the draft branch (inside the draft rules, same messages and keys).
- [ ] The list issue path (draft → pending) runs the same amount bounds over the stored draft as the editor, returning the same field errors.
- [ ] Add `.max(MAX_AMOUNT, "Discount can't exceed 99,999,999.99.")` (or fold the discount into the amount bounds) — confirm wording against `contracts/server-actions.md` and update the contract if it lists the discount messages.
- [ ] Tests per DoD; existing tests whose expectation changes are listed in the commit body.

## Edge cases

| Case | Behaviour |
|---|---|
| issued invoice, changed due date before issue date | still refused (AC-09) |
| draft with negative rate, editor save | refused on items.<i>.price / taxRate as today |
| issued invoice, attempt to change a locked amount | ISSUED_INVOICE_LOCKED as today |

## Definition of Done

- [ ] Integration tests show (1) a legacy PENDING invoice with a negative tax rate or zero quantity saves a notes-only edit, (2) issuing from the list a stored draft with a negative rate is refused with the same field error the editor gives and stays a draft, (3) a discount above 99,999,999.99 comes back as a discount field error, never FAILED; the unit bounds test covers the discount max.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
