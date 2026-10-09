---
id: "T37"
title: "Bind the Due Date and Bank account labels to their picker triggers and select them by name in the AC-07 e2e test"
layer: "ui"
deps: []
blocks: []
acs: ["AC-07", "AC-09"]
files_hint: ["components/invoice-editor/invoice-details-section.tsx", "components/invoice-editor/sender-section.tsx", "tests/component/", "tests/e2e/invoice-integrity/us04-overdue-due-date.spec.ts"]
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

# T37 — Bind the Due Date and Bank account labels to their picker triggers and select them by name in the AC-07 e2e test

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08-r2.md`](../_review/review-2026-10-08-r2.md).

## Why

Review finding L2.

## Inlined context

> L2: `invoice-details-section.tsx:143-150` `<Label>Due Date</Label>` is not bound to the PopoverTrigger; same at `sender-section.tsx:218-221`. Screen readers hear "invalid, Oct 22, 2026". The AC-07 e2e uses `getByRole('button', { name: /^(?!Pick).*,\s*\d{4}$/ }).last()`.
>
> — `_review/review-2026-10-08-r2.md L2, abridged`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08-r2.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-07, AC-09.

## Checklist

- [ ] Use `aria-labelledby` = label id + own id so the selected value stays in the name.
- [ ] Update the e2e selector.

## Edge cases

| Case | Behaviour |
|---|---|
| no value picked | name still contains the label |

## Definition of Done

- [ ] The Due Date and Bank account picker triggers have an accessible name containing the field label (Label htmlFor/id or aria-labelledby); a component test finds each by role and name; the AC-07 e2e opens the due-date picker by its name instead of a date-format regex. Passes via pnpm test and pnpm test:e2e.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] lint + vet clean
