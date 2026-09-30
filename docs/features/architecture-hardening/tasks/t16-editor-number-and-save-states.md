---
id: T16
title: "Build the editor number hint, field errors, saved state, legacy alert and SCR-15 dialog"
layer: "ui"
deps: ["T00", "T14", "T15"]
blocks: []
acs: ["AC-06", "AC-08", "AC-11", "AC-13", "AC-14", "AC-15", "AC-17"]
files_hint: ["components/invoice-editor/invoice-details-section.tsx", "components/invoice-editor/sender-section.tsx", "components/invoice-editor/invoice-editor-form.tsx", "components/invoice-editor/invoice-editor.tsx", "components/invoice-editor/invoice-item-fields.tsx", "components/invoice-editor/summary-section.tsx", "store/invoice-editor-store/", "hooks/use-editor-header-buttons.tsx"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T16 — Build the editor number hint, field errors, saved state, legacy alert and SCR-15 dialog

## Place in the sequence

- **Blocked by:** T14 — Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals, T15 — Extend ConfirmationModal with a body slot, async confirm and a hideable confirm button · **Blocks:** — · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`components/invoice-editor/invoice-details-section.tsx`), T10 (`store/invoice-editor-store/helpers.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** every invoice I save to get an invoice number that is unique within its sender profile, whether I keep the proposed number or type my own
> **So that** my numbering is continuous and a save never fails over a number I didn't choose
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the system to recompute and check every amount I save
> **So that** the totals on my PDFs and dashboard are always correct and never negative
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task shows the Freelancer the server's decisions: "assigned on save", the final number, blocking messages next to the right field, and the old-vs-new total confirmation.

## Inlined context

> | default-new | New invoice. The number `Input` is **empty**, its placeholder is the hint from `generateInvoiceNumber`, and `FieldDescription` reads "Assigned on save" (AC-06; flow 2) | `InvoiceEditor`, `Field`, `Input`, `FieldDescription` | wireframe A |
> | profile-changed | Sender profile changed on an existing invoice. The number field is cleared, the new profile's hint is shown, and the new-invoice rules apply (AC-11; flow 6) | `Input`, `FieldDescription` | wireframe A |
> | saved | Success. The final number and the stored totals from `SavedInvoice` replace the form values, whatever the browser had computed (AC-06, AC-13) | `InvoiceEditor`, `EditorSaveStatus` | existing layout |
> | validation | `VALIDATION`: a `FieldError` next to each offending field or line, with the contract's verbatim text (price, quantity, shipping, discount ≥ 0, discount ≤ subtotal + shipping, tax rate 0–100 %). The entered values are kept (AC-14, AC-15) | `FieldError` | wireframe B |
> | number-taken | `CONFLICT` with `fieldErrors.invoiceNumber`: "This invoice number is already used in this sender profile." (AC-08) | `FieldError` | wireframe B |
> | legacy-shared-number | `legacy.sharedNumber` on load: `Alert` (warning) above the form saying the number is also used by another invoice and must be changed before saving. The invoice stays viewable. On save, the `CONFLICT` `FieldError` on number shows the contract text (AC-17; flow 7) | `Alert`, `FieldError` | wireframe C |
> | legacy-totals | `CONFLICT` with `details.kind = 'TOTALS_CHANGED'` → opens SCR-15 (AC-17) | see SCR-15 | SCR-15 |
> | unknown-status | `VALIDATION` on `status`: `FieldError` "Unknown status." (AC-19). This is only reachable through a tampered request | `FieldError` | — |
> | relation-not-found | Save → `NOT_FOUND` (sender profile, Customer or bank account not owned): `toast.error` with the result's `error`, and the form is kept | `Sonner` | — |
> | save-failed | `FAILED`: `toast.error` with a "Retry" action that resubmits. The form is kept | `Sonner` | — |
>
> — `screens.md §SCR-03 Invoice editor, changed states, abridged` · full text: [screens.md](../screens.md)

> | default | Save → `CONFLICT` with `details.kind = 'TOTALS_CHANGED'`. The dialog shows the old total next to the new total (`details.oldTotal` / `newTotal`), with Cancel and "Confirm and save" (AC-17; flow 7) | `ConfirmationModal` (✎ extended) | wireframe below |
> | saving | Confirmed: the form is resubmitted with `confirmedTotals`. Confirm shows a `Spinner`, and the dialog stays open | `ConfirmationModal` ✎, `Spinner` | — |
> | totals-changed-again | The resubmit returns `TOTALS_CHANGED` again with different figures. The same dialog shows the fresh figures | `ConfirmationModal` ✎ | — |
> | confirmed | Success → the dialog closes, and SCR-03 is in its `saved` state | — | SCR-03 |
> | cancelled | Cancel → back to SCR-03. Nothing is saved and the form is kept | — | SCR-03 |
> | failed | `FAILED` → the dialog closes and `toast.error` shows | `Sonner` | — |
>
> — `screens.md §SCR-15 Legacy-invoice confirmation, states, abridged` · full text: [screens.md](../screens.md)

```text
| Confirm the new total                          |
| This invoice was saved before totals were      |
| recalculated.                                  |
|   Old total   120.00                           |
|   New total   119.99                           |
|               [ Cancel ] [ Confirm and save ]  |
```

— `screens.md §SCR-15, wireframe, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** **Strings:** inline, because the app has no i18n layer. Where the contract fixes a message (`contracts/server-actions.md`, `contracts/openapi.yaml`), the UI shows it **verbatim** from the result's `error` / `fieldErrors`. It never rewrites it and never shows raw database or upstream text (spec §6.1).
>
> — `screens.md §Source, Strings, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** New UI (error-with-retry, confirmations, field messages, the logo warning) is composed from the existing shadcn/ui primitives (`Empty`, `AlertDialog`, `Field`, `Sonner`) and modals go through `store/use-modal-store.ts` (architecture-map §Frontend). No new state or routing library.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Reads `ActionResult<SavedInvoice>` from `createInvoice` / `updateInvoice`: `fieldErrors` keys `invoiceNumber`, `items.<i>.price`, `items.<i>.quantity`, `shipping`, `discount`, `taxRate`, `status`; `details.kind = 'TOTALS_CHANGED'`; resubmits with `confirmedTotals: { oldTotal, newTotal }`. Reads `invoice.legacy` from `getInvoiceEditorData`; hint from `generateInvoiceNumber`.

— `contracts/server-actions.md §Invoices, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-06 — happy

> **Given** a Freelancer creating an invoice under a sender profile and leaving the invoice number field empty (the editor shows the proposed number only as a hint, "assigned on save")
> **When** the Freelancer saves the invoice
> **Then** the system assigns the next free number from that profile's invoice sequence at the moment of saving, advances the sequence, and shows the final number. An empty number field is the only signal that a number is system-proposed; any filled-in number is manual, even if it equals the hint
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a Freelancer who types an invoice number that is already used in the same sender profile, where two numbers count as the same if they match ignoring letter case and leading or trailing spaces (so "INV-001" and " inv-001 " are the same number)
> **When** the Freelancer saves the invoice
> **Then** the system blocks the save, says that this invoice number is already used in this sender profile, and leaves the invoice sequence unchanged
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — cross-context

> **Given** a Freelancer moving an existing invoice from sender profile A to sender profile B
> **When** the Freelancer saves the change
> **Then** the invoice number field is cleared and the same rules as for a new invoice in B apply: left empty, the invoice gets a number from B's invoice sequence and B's sequence advances (AC-06, AC-09); filled in, it is a manual number (AC-08, AC-10). A's invoice sequence does not change, and A's old number is not proposed again. The invoice never keeps A's number under B unless the Freelancer types it and it is free in B
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy

> **Given** a Freelancer saving an invoice with line items
> **When** the invoice is saved
> **Then** the system stores each line total as quantity × price rounded to 2 decimal places (half rounds up), whatever the browser sent; the subtotal is the sum of the rounded line totals, and the tax amount is rounded once. The editor uses the same rule, so the saved total equals the total the editor showed. If the browser sent different figures, the system's figures are stored and shown after saving, and the save is not blocked
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** a Freelancer entering a line with a negative price or a quantity of zero or less, or a negative shipping amount, a negative discount, or a tax rate outside 0–100 %
> **When** the Freelancer saves the invoice
> **Then** the system blocks the save and shows next to the offending field or line that the price, shipping and discount can't be negative, the quantity must be greater than zero, and the tax rate must be between 0 and 100 %
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — domain invariant

> **Given** a Freelancer entering a discount (a fixed amount in the invoice currency) larger than the subtotal plus shipping
> **When** the Freelancer saves the invoice
> **Then** the system blocks the save and explains that the discount can't exceed the subtotal plus shipping, so an invoice total can never be negative; a discount exactly equal to the subtotal plus shipping is allowed and gives a total of zero
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — cross-context

> **Given** an invoice saved before this change whose stored total differs from the recomputed total, whose amounts break the rules above, or whose invoice number is also used by another invoice in the same sender profile
> **When** the Freelancer edits and saves it in the editor
> **Then** the system shows the old and new totals and asks for confirmation before saving; an invoice whose amounts break the rules can't be saved until they are corrected; and an invoice with a shared number can be opened and viewed but can't be saved until its number is changed to a free one. A status change from the invoice list does not touch amounts or number and is never blocked by these checks
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Number field: value `''` for new invoices, hint as placeholder, `FieldDescription` "Assigned on save" — `components/invoice-editor/invoice-details-section.tsx`
- [ ] On sender-profile change for an existing invoice: clear the number, fetch the new hint — `components/invoice-editor/sender-section.tsx`, `store/invoice-editor-store/`
- [ ] Map `fieldErrors` onto react-hook-form paths via `setError` (keys already match form paths); keep values — `components/invoice-editor/invoice-editor-form.tsx`, `invoice-item-fields.tsx`, `summary-section.tsx`
- [ ] On success, replace the number and totals in the form/store from `SavedInvoice`
- [ ] Legacy `Alert` above the form when `legacy.sharedNumber` — `components/invoice-editor/invoice-editor.tsx`
- [ ] On `TOTALS_CHANGED`: open the extended `ConfirmationModal` (SCR-15) with old/new totals; confirm → resubmit with `confirmedTotals`; handle again/cancel/failed per the table — `hooks/use-editor-header-buttons.tsx` or the save handler
- [ ] `NOT_FOUND` → `toast.error(error)`; `FAILED` → `toast.error` with a Retry action

## Edge cases

| Case | Behaviour |
|---|---|
| Freelancer types the hint value exactly | Treated as manual (AC-06); if free, kept |
| Save blocked by number-taken | FieldError under number; all other values kept |
| Legacy shared number + changed totals | Shared-number CONFLICT shows first (server check order); dialog only after the number is fixed |
| Browser totals differ from stored after save | Form shows stored figures (AC-13) |

## Definition of Done

- [ ] in `pnpm dev`, walk SCR-03 states default-new, profile-changed, saved, validation, number-taken, legacy-shared-number, relation-not-found, save-failed and SCR-15 default/again/confirmed/cancelled; each matches screens.md (checklist in the PR)
- [ ] the total shown before save equals the stored total after save for a multi-line invoice (AC-13)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
