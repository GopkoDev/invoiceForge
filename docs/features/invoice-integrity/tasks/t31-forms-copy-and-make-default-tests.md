---
id: "T31"
title: "Make the product form's currency copy match the refuse-on-save rule and cover the make-default component row"
layer: "ui"
deps: []
blocks: []
acs: ["AC-13b", "AC-17"]
files_hint: ["components/products/product-form.tsx", "tests/component/default-and-currency-lock-forms.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T31 — Make the product form's currency copy match the refuse-on-save rule and cover the make-default component row

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review findings S5 and F10 (AC-17 part).

## Inlined context

> S5: `product-form.tsx:179-190` Alert "Currency and Unit Locked … cannot be changed", `:320-322` LockIcon on Currency, `:349-353` "Locked: Used in N invoices"; the currency Select (`:325-330`) is no longer disabled. SCR-12 `currency-locked`: the refusal comes on save.
> F10 / AC-17: the test-plan.md:85 component row (double-click on make-default, failed switch keeps A marked) is not implemented; T19 only tests the race toast.
>
> — `_review/review-2026-10-08.md S5, F10, abridged`; `screens.md SCR-09/SCR-10/SCR-12`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-13b, AC-17. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] Reword copy; keep the unit lock as is.
- [ ] Find where make-default lives (SCR-08/09/10 lists) and add the two tests; minimal production change if the double-click is not guarded.

## Edge cases

| Case | Behaviour |
|---|---|
| product not used on invoices | no lock copy at all |

## Definition of Done

- [ ] A component test shows the product form for a product used on invoices no longer claims the currency is locked (no lock icon or "Locked" text on currency; the alert says only the unit is locked up front and a currency change is refused on save), and component tests cover the test-plan AC-17 row: a double click on make-default sends one request and a failed switch keeps the previous default marked.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
