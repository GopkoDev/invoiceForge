---
id: T16
title: "Give every editor field, line field, icon button and row action an announced name and tie errors to fields"
layer: "ui"
deps: ["T11"]
blocks: ["T19"]
acs: ["AC-11", "AC-12"]
files_hint: ["components/invoice-editor/", "components/invoices/invoice-row-actions.tsx", "components/invoices/related-invoices-list.tsx", "components/dashboard/recent-invoices/", "tests/component/invoice-editor-accessible-names.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T16 — Give every editor field, line field, icon button and row action an announced name and tie errors to fields

## Place in the sequence

- **Blocked by:** T11 — Turn the editor store into a per-mount factory provided by context and built from server data · **Blocks:** T19 — Add the CI e2e job with the server/browser date matrix and the accessibility suite · **Wave:** DAG wave 5; delivery wave 4 of spec §1.
- **Lane:** shares files with T1 (`components/invoice-editor/invoice-pdf-document.tsx`); T2 (`components/dashboard/recent-invoices/`, `components/invoice-editor/invoice-editor-header.tsx` +2); T5 (`components/invoice-editor/invoice-editor.tsx`); T8 (`components/dashboard/recent-invoices/`, `components/invoice-editor/invoice-item-fields.tsx` +3); T10 (`components/invoice-editor/pdf-preview-document.tsx`, `components/invoice-editor/pdf-preview-panel.tsx`); T11 (`components/invoice-editor/`); T12 (`components/invoice-editor/invoice-details-section.tsx`); T13 (`components/invoice-editor/invoice-editor-save-status.tsx`); T17 (`components/invoice-editor/invoice-editor-form.tsx`, `components/invoice-editor/invoice-editor-resize-panels.tsx` +3); T18 (`components/invoice-editor/amount-input.tsx`, `components/invoice-editor/invoice-item-fields.tsx` +1) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** every editor field, error and icon button to have a name my screen reader announces
> **So that** I can create and send invoices without seeing the screen
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Lets a screen-reader user create and send invoices.

## Inlined context

> | Accessibility | Every editor field uses the shadcn `Field`/`Label` pairing so its visible label is its name; field errors render with an id and the input carries `aria-invalid` + `aria-describedby`; line fields without a visible label get `aria-label` "{column}, line {n}" from the current index; icon-only buttons get `aria-label`; text hidden on narrow screens keeps an accessible name (`sr-only`); row action buttons name the action and the invoice number | here; `docs/design-system.md` |
>
> — `sad.md §8, row «Accessibility», verbatim` · full text: [sad.md](../sad.md)

> U->>UI: reorders, adds or deletes a line
> UI->>UI: names every line field again from its current index
> …
> S-->>UI: refused with field errors
> UI->>UI: marks the field invalid and ties the error message to it by its id
> UI-->>U: announces the field as invalid with its plain-language message
>
> — `sad.md §6, Flow 9, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-11 — happy path

> **Given** a Freelancer using a screen reader in the invoice editor
> **When** they move through every field (sender, Customer, invoice details, each line, summary and notes) and every icon-only button (zoom in, zoom out, close preview, duplicate line, delete line, reorder line, more actions)
> **Then** each field announces its visible label and each button announces its action. A line field without a visible label of its own announces its column name and the line's position, such as "Quantity, line 3", and the position stays correct after lines are reordered, added or deleted. Print and Download keep an announced name on narrow screens where their text is hidden. The row actions button in the invoices list and in a Customer's or sender profile's related invoices announces its action and the invoice number
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — error

> **Given** a Freelancer using a screen reader who saves an invoice with an invalid field
> **When** the system refuses the save
> **Then** the field is announced as invalid together with its plain-language error message, and the message is tied to that field, not only shown near it
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Sender, Customer, details, summary and notes sections (`components/invoice-editor/*-section.tsx`): use `Field` + `Label htmlFor` for every input/select/combobox.
- [ ] Line fields (`invoice-item-fields.tsx`, `invoice-item-row.tsx`, `invoice-item-card.tsx`): `aria-label={`${column}, line ${index + 1}`}` from the current render index.
- [ ] Icon buttons: zoom in/out, close preview (`pdf-preview-panel.tsx`), duplicate/delete/reorder line (`invoice-item-actions.tsx`, `sortable-item.tsx`), more actions — `aria-label`; header Print/Download keep `sr-only` text when the visible text is hidden.
- [ ] Row actions button in `components/invoices/invoice-row-actions.tsx`, `related-invoices-list.tsx`, dashboard recent invoices: `aria-label={`Actions for invoice ${number}`}`.
- [ ] Field errors: error element `id`, input `aria-invalid` + `aria-describedby` (reuse the shadcn `FieldError` wiring).
- [ ] Component tests with testing-library `getByRole(..., { name })` for each item, including «Quantity, line 3» after a reorder and a delete, and an invalid field's description.

## Edge cases

| Case | Behaviour |
|---|---|
| line 2 deleted from 3 lines | former line 3 now announces «…, line 2» |
| narrow screen hides Print/Download text | buttons still named «Print» / «Download» |
| refusal clears after a fix | `aria-invalid` removed, description detached |

## Definition of Done

- [ ] component name/role tests pass
- [ ] existing editor field-error tests pass
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
