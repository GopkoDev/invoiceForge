---
id: "T36"
title: "Record the outcome of deleteInvoice on an invoices.delete span and state which write paths the friction signal counts"
layer: "app"
deps: []
blocks: []
acs: ["AC-06"]
files_hint: ["lib/services/invoices/invoices.ts", "tests/unit/services/invoice-save-spans.test.ts", "docs/features/invoice-integrity/sad.md"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
source: "review-2026-10-08-r2"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T36 — Record the outcome of deleteInvoice on an invoices.delete span and state which write paths the friction signal counts

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08-r2.md`](../_review/review-2026-10-08-r2.md).

## Why

Review finding L1.

## Inlined context

> L1: `deleteInvoice` (`invoices.ts:1234-1256`) runs outside any span, so its `STATUS_NOT_ALLOWED` refusals never reach the friction signal (sad §7 "counted refusal outcomes per write path").
>
> — `_review/review-2026-10-08-r2.md L1, abridged`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08-r2.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-06.

## Checklist

- [ ] Wrap deleteInvoice; keep its try/catch inside the span so the outcome sees the ActionResult.
- [ ] Patch sad §7 Monitoring wording.

## Edge cases

| Case | Behaviour |
|---|---|
| invoice missing | `refused:not-found` |

## Definition of Done

- [ ] deleteInvoice runs in inOutcomeSpan as `invoices.delete`; a unit test shows a refused delete of an issued invoice records `refused:lifecycle` and a draft delete records `ok`; sad.md §7 names the counted write paths (invoice create, update, duplicate, status change, delete) and states that the bank-account and product currency-lock refusals are not part of the invoice friction signal.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] lint + vet clean
