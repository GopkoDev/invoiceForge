---
id: "T35"
title: "Describe the invoice, sender-profile and product lock order in data-model.md and sad.md flows 3, 4 and 9"
layer: "docs"
deps: []
blocks: []
acs: ["AC-11", "AC-12", "AC-13", "AC-13b"]
files_hint: ["docs/features/invoice-integrity/data-model.md", "docs/features/invoice-integrity/sad.md", "lib/services/invoices/helpers.ts"]
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

# T35 — Describe the invoice, sender-profile and product lock order in data-model.md and sad.md flows 3, 4 and 9

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08-r2.md`](../_review/review-2026-10-08-r2.md).

## Why

Review finding N3.

## Inlined context

> N3: code takes invoice row → sender profile → line products `FOR SHARE` (sorted by id); the profile lock comes before the draft rules on create, duplicate and draft update; `updateProduct` locks the product `FOR UPDATE`. `data-model.md:103,126-130` lists only the invoice row lock and calls Product read only; `sad.md:285-292` (flow 3) draws the profile lock after the rules; flow 9 (`sad.md:467`) has no product lock; `helpers.ts:186-190` cites ADR-0002.
>
> — `_review/review-2026-10-08-r2.md N3, abridged`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08-r2.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-11, AC-12, AC-13, AC-13b.

## Checklist

- [ ] Docs-only plus one comment: no test (no behaviour change). Gate: lint + typecheck.

## Edge cases

| Case | Behaviour |
|---|---|
| — | — |

## Definition of Done

- [ ] data-model.md "Lock for write" names the sender-profile lock and the line-product FOR SHARE lock in order (invoice row → sender profile → line products by id) and updateProduct's FOR UPDATE; Product is no longer called read-only; sad.md flow 3 takes the profile lock before the draft rules, flow 9 shows the product row lock; the helpers.ts comment cites ADR-0005 and T26 instead of ADR-0002.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] lint + vet clean
