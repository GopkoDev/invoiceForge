---
id: "T39"
title: "Rename the inner delete function to deleteInvoiceUnspanned to match the other spanned write paths"
layer: "app"
deps: []
blocks: []
acs: ["AC-06"]
files_hint: ["lib/services/invoices/invoices.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
source: "review-2026-10-08-r3"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T39 — Rename the inner delete function to deleteInvoiceUnspanned to match the other spanned write paths

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08-r3.md`](../_review/review-2026-10-08-r3.md).

## Why

Review finding P1.

## Inlined context

> P1: The inner delete function is named `deleteInvoiceInSpan`. The other spanned write paths name theirs `*Unspanned` (`createInvoiceUnspanned`, `updateInvoiceUnspanned`, `updateInvoiceStatusUnspanned`, `duplicateInvoiceUnspanned`), so the new name says the opposite of what the function does.
>
> — `_review/review-2026-10-08-r3.md P1`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [review record](../_review/review-2026-10-08-r3.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-06 (behaviour unchanged).

## Checklist

- [ ] Rename `deleteInvoiceInSpan` → `deleteInvoiceUnspanned` (`lib/services/invoices/invoices.ts`).
- [ ] Pure rename: no RED test; the existing span and delete tests are the safety net.

## Edge cases

| Case | Behaviour |
|---|---|
| — | — |

## Definition of Done

- [ ] The inner function behind deleteInvoice is named deleteInvoiceUnspanned like the other spanned write paths. No behaviour change; the existing span and delete tests stay green.
- [ ] lint + vet clean
