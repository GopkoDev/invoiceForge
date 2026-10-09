---
id: T15
title: "Offer only lifecycle-allowed row actions, confirm Cancel with SCR-04 and redraw refused rows at their current status"
layer: "ui"
deps: ["T03", "T07", "T10"]
blocks: []
acs: ["AC-04", "AC-05", "AC-06", "AC-10"]
files_hint: ["components/invoices/invoice-row-actions.tsx", "components/invoices/invoices-data-table.tsx", "tests/component/invoice-row-actions-lifecycle.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T15 — Offer only lifecycle-allowed row actions, confirm Cancel with SCR-04 and redraw refused rows at their current status

## Place in the sequence

- **Blocked by:** T03 — Encode the status lifecycle as a transition table with decideStatusChange and add the new ActionResult detail kinds, T07 — Create and duplicate invoices only as drafts under the draft rules, numbered by the issue date's year, T10 — Decide list status changes and deletes under the row lock with the lifecycle and the draft rules on issue · **Blocks:** — · **Wave:** 6 — needs the shared transition table and the server answers (`STATUS_NOT_ALLOWED`, duplicate `VALIDATION`) it renders.
- **Lane:** own lane (`components/invoices/`).

## Why (user story)

> **As a** Freelancer
> **I want** only sensible status changes to be accepted
> **So that** a paid or cancelled invoice cannot be rewound into a draft, deleted, or silently lose its payment date
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a save from an outdated editor to be refused with an explanation
> **So that** marking an invoice paid in one tab is never undone by saving it in another
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task makes the invoice list offer only the moves the lifecycle allows and show the server's refusal when a row was stale.

## Inlined context

> Each row's menu offers only the moves that the shared transition table (ADR-0002) allows from the row's **stored** status. The badge still shows the derived status, so a past-due pending row reads Overdue but offers the pending moves.
> - draft row: View, Download, Print, Edit, Duplicate, Mark as Pending, Delete. **No Cancel**
> - pending row: View, Download, Print, Edit, Duplicate, Mark as Paid, Mark as Overdue, Cancel Invoice. No Delete
> - overdue row (stored): View, Download, Print, Edit, Duplicate, Mark as Paid, Cancel Invoice. **Mark as Pending** only while the due date is today or later in the Freelancer's time zone
> - paid row: View, Download, Print, Edit, Duplicate, Mark as Pending. No Cancel
> - cancelled row: View, Download, Print, Duplicate only. The number link still opens the read-only editor
> - status-changed: `toast.success` "Invoice marked as {status}"; badge and paid date refresh
> - status-refused: `VALIDATION` + `STATUS_NOT_ALLOWED` → `toast.error` with the result's `error` verbatim, then the row is redrawn at `details.currentStatus` with that status's menu
> - issue-refused: Mark as Pending on a draft that breaks a draft rule → `toast.error` with `error`; row stays a draft
> - delete-refused: `VALIDATION` + `STATUS_NOT_ALLOWED` → `toast.error`, row redrawn at `currentStatus`
> - duplicated: `toast.success` "Duplicated as {invoiceNumber}" (any source status, cancelled included); duplicate-refused: `toast.error` with "This invoice can't be duplicated. {reasons}" verbatim
>
> — `screens.md §SCR-01, states default…duplicate-refused, abridged` · full text: [screens.md](../screens.md)

> SCR-04 — Cancel Invoice on a pending or overdue row. Title "Cancel invoice {invoiceNumber}?". Description: "A cancelled invoice is final. It stays in your list and can still be viewed, downloaded, printed and duplicated, but it can't be changed or deleted." Buttons **Keep invoice** and **Cancel invoice** (destructive). Confirm → async `onConfirm` (`updateInvoiceStatus(id, 'CANCELLED')`), spinner, both buttons disabled, never auto-closed. Success/refused/not-found: the caller closes the dialog, then toast (refused → SCR-01 `status-refused`). Keep or Esc: row unchanged.
>
> — `screens.md §SCR-04, all states, abridged` · full text: [screens.md](../screens.md)

> `InvoiceRowActions` is shared by the invoice list and the dashboard's recent invoices, so every row state applies to both. Reused: `InvoicesDataTable`, `InvoiceRowActions`, `DropdownMenu`, `Badge`, `ConfirmationModal`, `Sonner`, `Spinner`. **New components: None.**
>
> — `screens.md §SCR-01 + §New components, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** the editor and list import the same table to offer only allowed actions; no rule lives in a component.
>
> — `sad.md §4, strategic choice 2 + §5, abridged` · full text: [sad.md](../sad.md)

Today `invoice-row-actions.tsx:197–204` hand-codes `canDelete`/`canMarkAsPaid`/`canCancel` (e.g. Cancel offered on drafts) — replace with the T03 table. — `components/invoices/invoice-row-actions.tsx` at HEAD, the code wins.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `updateInvoiceStatus(id, status)` → `{ status, paidAt }` · errors: `VALIDATION` + `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus, suggestion }`, `VALIDATION` with joined draft-rule messages (issue refused), `NOT_FOUND`.
- `deleteInvoice(id)` → `VALIDATION` + `STATUS_NOT_ALLOWED` for a non-draft, `NOT_FOUND`.
- `duplicateInvoice(id)` → `{ id, invoiceNumber }` · `VALIDATION` "This invoice can't be duplicated. {reasons}".

— `contracts/server-actions.md §updateInvoiceStatus, §deleteInvoice, §duplicateInvoice, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-04 — happy path

> **Given** a Freelancer with invoices in each status
> **When** they change statuses
> **Then** only these changes are accepted: draft to pending; pending to paid, overdue or cancelled; overdue that was marked by hand to pending, while the due date has not passed; overdue to paid or cancelled; paid to pending. Entering paid records the payment date, the moment the invoice was marked paid, and paid to pending clears it. A request for the status the invoice already has is not a status change: it is accepted together with the rest of the save, subject to the other rules, and never touches the payment date. Every other change is refused, and the invoice is left as it was
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — domain invariant

> **Given** a Freelancer with a paid invoice
> **When** they try to turn it back into a draft
> **Then** the system refuses, tells them an issued invoice can never return to draft, and suggests cancelling and duplicating it instead. Its status and payment date are unchanged
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** a Freelancer with a cancelled invoice
> **When** they try to change its status, edit any field, or delete it
> **Then** the system refuses and tells them a cancelled invoice is final. The invoice keeps its number and stays in the list and printable. Duplicate is still offered
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant (concurrent edge)

> **Given** a Freelancer has a pending invoice open in the editor, and marks it paid from the invoice list in another tab
> **When** they save from the editor that was opened before the payment
> **Then** the system refuses the save and tells them the invoice was changed elsewhere and must be reloaded. The invoice stays paid with its payment date, and nothing from the refused save is stored. The same refusal applies to drafts and to any change made elsewhere after the editor was opened, including a notes-only edit. A status change from the invoice list is not checked for freshness; it is accepted or refused by AC-04 against the invoice's current status, so marking paid an invoice that was cancelled elsewhere is refused as a change out of cancelled
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

(This task owns the list half of AC-10: the stale-row refusal and redraw. The editor half is T18.)

## Checklist

- [ ] `components/invoices/invoice-row-actions.tsx` — derive the menu from the T03 transition table and the row's **stored** status; overdue → pending gated on due date ≥ today in the Freelancer time zone (shared overdue/today helper); Delete only for drafts; Duplicate for every status; Edit hidden for cancelled.
- [ ] Same file — Cancel Invoice opens `ConfirmationModal` with the SCR-04 title, description and button labels; async confirm calls `updateInvoiceStatus(id, 'CANCELLED')`; the caller closes the dialog on every result.
- [ ] Same file / `components/invoices/invoices-data-table.tsx` — on `STATUS_NOT_ALLOWED` show `toast.error(result.error)` and redraw the row at `details.currentStatus` (router refresh or local row update); issue-refused, delete-refused, duplicate-refused toasts verbatim.
- [ ] `tests/component/invoice-row-actions-lifecycle.test.tsx` — one menu snapshot per stored status (wireframe A), overdue past-due vs not, Cancel flow (keep / confirm / refused), refused redraw.

## Edge cases

| Case | Behaviour |
|---|---|
| Pending row past its due date (badge reads Overdue) | Menu of the stored status `PENDING`: Mark as Paid, Mark as Overdue, Cancel |
| Stored overdue, due date yesterday | No Mark as Pending |
| Row cancelled in another tab, user clicks Mark as Paid | `toast.error` "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft."; row redrawn as Cancelled |
| Cancel confirmed but invoice was paid elsewhere | Dialog closes, SCR-01 `status-refused` |
| Mark as Pending on a draft with mismatching currency | `toast.error` with the joined editor messages; row stays Draft |
| Esc / Keep invoice in SCR-04 | Nothing sent, row unchanged |
| `NOT_FOUND` on any row action | `toast.error` with `error` |

## Definition of Done

- [ ] Component tests show each stored status renders exactly the SCR-01 wireframe-A menu (Mark as Pending on stored overdue only while due date ≥ today in the Freelancer time zone), Cancel opens SCR-04 and calls updateInvoiceStatus only on confirm, and a STATUS_NOT_ALLOWED result shows the error verbatim and redraws the row at currentStatus.
- [ ] The dashboard's recent invoices (same `InvoiceRowActions`) behave identically.
- [ ] No hand-coded status condition remains in the component; the menu comes from the shared table.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
