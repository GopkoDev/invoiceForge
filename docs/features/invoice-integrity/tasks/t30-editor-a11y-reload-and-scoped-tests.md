---
id: "T30"
title: "Link the new editor field errors to their controls, give Reload a busy state, and scope the editor error and inactive-product tests"
layer: "ui"
deps: ["T22", "T24"]
blocks: []
acs: ["AC-11", "AC-12", "AC-15", "AC-19"]
files_hint: ["components/invoice-editor/invoice-editor.tsx", "components/invoice-editor/invoice-details-section.tsx", "components/invoice-editor/sender-section.tsx", "components/invoice-editor/invoice-item-row.tsx", "components/invoice-editor/invoice-item-card.tsx", "tests/component/invoice-editor-field-errors.test.tsx", "tests/component/invoice-editor-modes.test.tsx", "tests/component/invoice-editor-changed-elsewhere.test.tsx"]
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

# T30 — Link the new editor field errors to their controls, give Reload a busy state, and scope the editor error and inactive-product tests

## Place in the sequence

- **Blocked by:** T22 — Refresh the issued details in the editor after Save and issue and never offer a picker on an issued invoice, T24 — Pin the editor's account-driven currency: picking a bank account sets the draft currency and a catalogue line in another currency is refused on its line · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review findings S6, S7 and F10 (editor part).

## Inlined context

> S6: the stale banner's Reload (`invoice-editor.tsx:86`) has no busy state; SCR-02 `stale` says Reload "does the same as SCR-05's Reload" (SCR-05 `reloading` shows a Spinner and disables the buttons).
> S7: FieldErrors render but the trigger gets no `aria-invalid` (`invoice-details-section.tsx:147,184`; `sender-section.tsx:201,258`; `invoice-item-row.tsx` / `invoice-item-card.tsx` for `items.<i>.productId`). The existing pattern does this for `invoiceNumber`, `discount`, `price`.
> F10: `invoice-editor-field-errors.test.tsx:155-157` only checks each message appears somewhere; `invoice-editor-modes.test.tsx:123-134` never checks the inactive product is absent from the add-line picker (AC-15: "Consulting 2025 is not offered when adding new lines").
>
> — `_review/review-2026-10-08.md S6, S7, F10, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-11, AC-12, AC-15, AC-19. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] aria-invalid on the three triggers.
- [ ] Reload pending flag + Spinner + disabled (reuse SCR-05 pattern).
- [ ] Scope assertions with `within(...)`; add the picker-absence assertion.

## Edge cases

| Case | Behaviour |
|---|---|
| reload fails | button re-enabled, error shown as today |

## Definition of Done

- [ ] Component tests show: the due date, bank account and line product triggers get aria-invalid when their field error is present; the stale banner's Reload shows a spinner and is disabled while reloading (a double click triggers one reload); each AC-11/AC-12/AC-19 field error is asserted within its own field container; the inactive "Consulting 2025" product is absent from the add-line picker while its existing line stays.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
