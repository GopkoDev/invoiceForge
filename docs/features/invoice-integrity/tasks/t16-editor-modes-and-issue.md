---
id: T16
title: "Render the editor in draft, issued and cancelled modes with Save and issue and retired-product lines kept"
layer: "ui"
deps: ["T08", "T09"]
blocks: ["T17"]
acs: ["AC-06", "AC-07", "AC-08", "AC-15", "AC-16"]
files_hint: ["components/invoice-editor/", "components/modals/invoice-editor/invalid-items-warning-dialog.tsx", "components/modals/modal-types-registry.ts", "lib/services/invoices/editor-data.ts", "tests/component/invoice-editor-modes.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T16 — Render the editor in draft, issued and cancelled modes with Save and issue and retired-product lines kept

## Place in the sequence

- **Blocked by:** T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice and write only the four editable fields on issued invoices, T09 — Apply every draft rule on draft saves and issuing from the editor, refreshing issued details only while the invoice is a draft · **Blocks:** T17 — Show every new invoice rule refusal under its field in the editor · **Wave:** 5 — the modes mirror what `updateInvoice` now accepts per status.
- **Lane:** `components/invoice-editor/` lane (T16 → T17 → T18, serialized); this task goes first.

## Why (user story)

> **As a** Freelancer
> **I want** to change only the due date, notes, payment terms and PO number of an issued invoice, and to cancel and duplicate it for anything else
> **So that** small corrections stay easy while what I billed stays fixed
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** invoices to keep their lines when I deactivate or delete a product
> **So that** an invoice's lines and total never change just because I tidied up my product list
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task gives the editor its three status-driven modes, the Save and issue action, and stops it from flagging or removing retired-product lines.

## Inlined context

> The mode follows the invoice's stored status: **draft** (fully editable), **issued** (pending, overdue, paid: four fields editable) or **cancelled** (read-only).
> - default-new: header shows **Save** only, no Save and issue (AC-04b)
> - draft: every field editable; header shows **Save** and **Save and issue**. The product picker for a new line offers only active products. A deactivated product's line shows exactly as saved, incl. custom-price marking; a deleted product's line shows as free text. No line is ever flagged for removal
> - issued-from-editor: Save and issue succeeds → `toast.success` "Invoice issued"; badge reads Pending; editor switches to `issued` in place without a reload
> - issued: Editable **due date, notes, payment terms, PO number**. Number, issue date, currency, tax, discount, shipping and terms inputs disabled; line add/remove/reorder hidden; sender, Customer and bank blocks show the **issued details** as text, not a picker. A permanent info `Alert`: "This invoice is issued. You can change only the due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it." Header shows **Save** only
> - issued — saved: badge follows the derived status; a hand-marked overdue one still reads Overdue
> - cancelled: fully read-only, every input disabled, **Save hidden**, Download and Print stay; info `Alert` "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft."
>
> — `screens.md §SCR-02, states default-new, draft, issued-from-editor, issued, issued — saved, cancelled, abridged` · full text: [screens.md](../screens.md)

> Decisions: (1) a saved draft gets a **Save and issue** button calling `updateInvoice` with `status: PENDING`; (2) the permanent issued `Alert` replaces the current `EditSentedInvoiceAlert` text; (4) the editor's preview/Download/Print render the form as it stands. **Retired:** `ItemSectionInvalidItems` and `InvalidItemsWarningDialog` ("…will be removed when you save") for both reasons, currency and custom price. **New components: None** — `Alert`, `Button`, `Input` (disabled), `InvoiceEditorHeader`, `Badge`, `Sonner` reused.
>
> — `screens.md §Source decisions 1, 2, 4 + Retired + §New components, abridged` · full text: [screens.md](../screens.md)

> The editor loads every product referenced by the invoice's lines, active or not; lines are never removed automatically; inactive products are not offered for new lines.
>
> — `sad.md §4, tactical "Retired products", verbatim` · full text: [sad.md](../sad.md)

Current code: `invoice-editor.tsx:82` renders `<EditSentedInvoiceAlert />`; `items-section.tsx` + `item-section-invalid-items.tsx` and `components/modals/invoice-editor/invalid-items-warning-dialog.tsx` (registered in `modal-types-registry.ts`) implement the retired warning. — repo at HEAD, the code wins.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `getInvoiceEditorData(invoiceId?)` ✎ — `initialData` gains `version`; `products`: active products **plus every product referenced by the invoice's lines, active or not**, each with its `isActive`. The editor offers only `isActive` products for new lines and never removes a line automatically (AC-15).
- `updateInvoice(id, { …, status: 'PENDING' })` from a saved draft = issuing from the editor; success returns `SavedInvoice` with `status` and `version`.

— `contracts/server-actions.md §getInvoiceEditorData / getInvoice, §updateInvoice step 7, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-06 — domain invariant

> **Given** a Freelancer with a cancelled invoice
> **When** they try to change its status, edit any field, or delete it
> **Then** the system refuses and tells them a cancelled invoice is final. The invoice keeps its number and stays in the list and printable. Duplicate is still offered
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy path

> **Given** a Freelancer with a pending invoice that became overdue yesterday
> **When** they move its due date to next week, add a note and save
> **Then** both changes are saved, the invoice is no longer counted as overdue, and its issued details, lines, amounts, issue date, currency and number are unchanged. An invoice the Freelancer marked overdue by hand stays overdue when its due date is moved into the future, until they move it back to pending themselves
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a Freelancer with an issued invoice
> **When** they try to change any field other than the due date, notes, payment terms and PO number, such as a line (its product, description, unit, quantity or price), the tax, the discount, the shipping, the terms, the issue date, the currency, the Customer, the sender profile, the bank account or the number
> **Then** the editor shows those fields as read-only. Any such change that reaches the system anyway is refused with the explanation that an issued invoice can only change its due date, notes, payment terms and PO number, and that cancelling and duplicating it is the way to correct it
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — cross-context

> **Given** a draft and a paid invoice that each have a line for the product "Consulting 2025", which the Freelancer has since deactivated
> **When** the Freelancer opens either invoice, and saves the draft after changing its notes
> **Then** the line stays with its description, quantity, price, amount and custom-price marking exactly as they were saved, and the total is unchanged. No warning offers to remove it. "Consulting 2025" is not offered when adding new lines
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — happy path

> **Given** an invoice with a line for a product the Freelancer later deleted
> **When** they open the invoice or download its PDF
> **Then** the line still shows its description, quantity, price and amount as free text, and the total is unchanged
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

(Editor half of AC-07/AC-08/AC-16; the server half is T08/T09, the PDF half T14.)

## Checklist

- [ ] `lib/services/invoices/editor-data.ts` — load active products plus every product referenced by the lines (inactive included) with `isActive`; expose `version` in `initialData`.
- [ ] `components/invoice-editor/invoice-editor.tsx` (+ header, sections) — derive mode from stored status; draft / issued / cancelled per SCR-02; issued sender/Customer/bank blocks render the snapshot columns as text.
- [ ] `components/invoice-editor/invoice-editor-header.tsx` — **Save and issue** on a saved draft only; on success `toast.success("Invoice issued")` and switch to issued mode in place; Save hidden when cancelled.
- [ ] `components/invoice-editor/edit-sented-invoice-alert.tsx` — rewrite to the permanent issued text; add the cancelled info `Alert` (reuse `Alert`).
- [ ] `components/invoice-editor/items-section.tsx`, `item-section-invalid-items.tsx`, `components/modals/invoice-editor/invalid-items-warning-dialog.tsx`, `components/modals/modal-types-registry.ts` — remove the invalid-items alert/dialog; product picker filters `isActive`.
- [ ] `tests/component/invoice-editor-modes.test.tsx` — one test per mode + retired-line rendering.

## Edge cases

| Case | Behaviour |
|---|---|
| New, unsaved invoice | Save only, no Save and issue |
| Paid invoice opened | Issued mode, four fields editable, issued Alert |
| Hand-marked overdue, due date moved to next week, saved | Badge still reads Overdue |
| Deactivated product on a line | Line shown as saved with custom-price marking; product absent from the new-line picker |
| Deleted product (`productId` null) | Line shown as free text, total unchanged |
| Cancelled invoice | All inputs disabled, Save hidden, Download/Print available |

## Definition of Done

- [ ] Component tests show the draft mode with Save and Save and issue (none on a new invoice), the issued mode with only the four fields enabled, issued details as text and the permanent info Alert, the cancelled mode read-only with Save hidden, inactive/deleted-product lines shown as saved with no removal warning, and getInvoiceEditorData returning every product referenced by the lines.
- [ ] `ItemSectionInvalidItems` and `InvalidItemsWarningDialog` are gone; no test references them (list any removed test in the PR — NFR "Changed test expectations").
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
