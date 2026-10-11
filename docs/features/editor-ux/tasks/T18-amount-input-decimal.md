---
id: T18
title: "Add the shared AmountInput with a decimal keypad and use it for line, discount, tax and shipping fields"
layer: "ui"
deps: ["T8", "T11"]
blocks: []
acs: ["AC-13"]
files_hint: ["components/invoice-editor/amount-input.tsx", "components/invoice-editor/invoice-item-fields.tsx", "components/invoice-editor/summary-section.tsx", "hooks/use-number-draft.ts", "docs/design-system.md", "tests/component/amount-input.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T18 — Add the shared AmountInput with a decimal keypad and use it for line, discount, tax and shipping fields

## Place in the sequence

- **Blocked by:** T8 — Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint, T11 — Turn the editor store into a per-mount factory provided by context and built from server data · **Blocks:** nothing · **Wave:** DAG wave 5; delivery wave 4 of spec §1.
- **Lane:** shares files with T8 (`components/invoice-editor/invoice-item-fields.tsx`, `components/invoice-editor/summary-section.tsx`); T11 (`components/invoice-editor/amount-input.tsx`, `components/invoice-editor/invoice-item-fields.tsx` +2); T16 (`components/invoice-editor/amount-input.tsx`, `components/invoice-editor/invoice-item-fields.tsx` +1) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the editor to open in its phone layout and offer a numeric keypad for amounts
> **So that** I can fix an invoice on the go without the form jumping or losing what I typed
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Gives phone users a numeric keypad with a decimal point for every amount.

## Inlined context

> | Amount inputs | One shared `AmountInput` (`inputMode="decimal"`, "." as the only decimal separator) for line price and quantity, discount, tax rate and shipping | here; §11 iOS keypad risk |
>
> — `sad.md §8, row «Amount inputs», verbatim` · full text: [sad.md](../sad.md)

> On iOS with a region that uses "," as the decimal separator, the `inputMode="decimal"` keypad may offer "," and no ".", so AC-13 … could not be met as written | Medium | Check on a real iPhone with a Ukrainian region early in wave 4; if "." is missing, take it to the spec owner (accept "," and normalise it, or change the keypad type) before building the remaining phone work
>
> — `sad.md §11, risk «iOS keypad», abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-13 — happy path

> **Given** a Freelancer on a phone-width screen (390 px wide)
> **When** they open the editor for a new or an existing invoice and tap a line's price or quantity, or the summary's discount, tax rate or shipping field
> **Then** the editor appears in its phone layout from the first display, without first drawing the desktop layout. Those fields open a numeric keypad on which a decimal point "." can be typed. The decimal point "." is the only decimal separator these fields accept
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] FIRST: check `inputMode="decimal"` on a real iPhone with a Ukrainian region; if «.» is missing, stop and raise it with the spec owner (sad §11) before continuing.
- [ ] `components/invoice-editor/amount-input.tsx` over the shadcn `Input` and the existing `use-number-draft` raw-draft logic: `inputMode="decimal"`, rejects `,` and any other separator.
- [ ] Use it in `invoice-item-fields.tsx` (price, quantity) and `summary-section.tsx` (discount, tax rate, shipping).
- [ ] Register `AmountInput` in `docs/design-system.md` component inventory.
- [ ] Component tests: `inputmode=decimal` attribute; «12.5» accepted; «12,5» not accepted; unfinished «12.» kept as a draft.

## Edge cases

| Case | Behaviour |
|---|---|
| unfinished «12.» | kept as typed (draft), validated on blur as today |
| comma typed | not accepted (AC-13) |
| iOS keypad without «.» | escalate per sad §11 — do not ship a silent workaround |

## Definition of Done

- [ ] AmountInput component tests pass; `editor-number-*` tests still pass
- [ ] the iPhone check result is noted in the PR
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
