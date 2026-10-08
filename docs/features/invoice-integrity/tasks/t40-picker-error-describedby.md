---
id: "T40"
title: "Point the Due Date and Bank account picker triggers at their error text with aria-describedby"
layer: "ui"
deps: []
blocks: []
acs: ["AC-09"]
files_hint: ["components/invoice-editor/invoice-details-section.tsx", "components/invoice-editor/sender-section.tsx", "tests/component/invoice-editor-field-errors.test.tsx"]
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

# T40 — Point the Due Date and Bank account picker triggers at their error text with aria-describedby

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08-r3.md`](../_review/review-2026-10-08-r3.md).

## Why

Review finding P2.

## Inlined context

> P2: The Due Date and Bank account picker triggers set `aria-invalid` but no `aria-describedby` that points at the error text. When focus returns to the trigger, a screen reader says "invalid" with no reason.
>
> — `_review/review-2026-10-08-r3.md P2`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [screens.md](../screens.md) · [review record](../_review/review-2026-10-08-r3.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-09.

## Checklist

- [ ] Give the due-date and bank-account `FieldError` an id built from the section's existing `useId` prefix.
- [ ] Set `aria-describedby` on the trigger to that id only while the field has an error.

## Edge cases

| Case | Behaviour |
|---|---|
| No error | The trigger has no `aria-describedby` (no dangling reference). |
| Error shown | The trigger's accessible description is the error message. |

## Definition of Done

- [ ] While a due-date or bank-account error is shown, the trigger's accessible description is the error message; with no error it has no aria-describedby. A component test asserts both. Passes via pnpm test.
- [ ] lint + vet clean
