---
id: T08
title: "Show the derived overdue status on the invoice list, customer page, invoice page and recent invoices"
layer: "ui"
deps: ["T06", "T07"]
blocks: []
acs: ["AC-24"]
files_hint: ["components/invoices/invoice-row-actions.tsx", "components/invoices/invoices-toolbar.tsx", "components/invoices/related-invoices-list.tsx", "components/dashboard/recent-invoices/", "types/invoice/types.ts", "tests/component/invoice-row-actions-derived-overdue.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T08 — Show the derived overdue status on the invoice list, customer page, invoice page and recent invoices

## Place in the sequence

- **Blocked by:** T06 — Apply the shared overdue rule to every dashboard figure and show tabs for issued-invoice currencies, T07 — Return the derived status from every invoice read and filter by the shared rule · **Blocks:** — · **Wave:** 3 — consumes the derived status the services now return.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the dashboard and invoice list to treat a past-due unpaid invoice as overdue without my marking it
> **So that** my dashboard and my Assistant agree on who owes me
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task makes every screen that shows an invoice status show the derived one and offer only the actions it allows.

## Inlined context

> **SCR-05 — Invoice list.** Changed: derived status only (ADR-0005). Layout, filters and pagination are unchanged.
>
> | State | Trigger / condition | Components |
> |---|---|---|
> | default | A pending invoice whose due date is before today in the Freelancer time zone shows `Overdue`. The status filter "Overdue" includes it and "Pending" leaves it out (AC-24) | `InvoicesDataTable`, `InvoiceStatusBadge` |
> | row menu (overdue) | Row actions for a derived or stored overdue invoice: View, Edit, Download, Print, **Mark as Paid**, Cancel Invoice. No "Mark as Overdue" and no "Mark as Pending" (AC-24). `InvoiceRowActions` already hides both when `status` is `OVERDUE`, so it needs the derived status, not a new rule | `InvoiceRowActions` |
> | paid | Mark as Paid → `ok()`: `toast.success`, badge `Paid` (unchanged path) | `Sonner`, `InvoiceStatusBadge` |
> | status-rejected | `updateInvoiceStatus` → `VALIDATION` "This invoice is overdue because its due date has passed. You can still mark it paid." (the page was loaded before the due date passed, and the Freelancer clicks Mark as Overdue). `toast.error` verbatim, and the row refreshes to `Overdue` | `Sonner` |
>
> — `screens.md §Screens, SCR-05, abridged` · full text: [screens.md](../screens.md)

> **SCR-06 — Customer page.** default: the Customer's invoices show the derived status. A past-due pending invoice shows `Overdue` — `RelatedInvoicesList`, `InvoiceStatusBadge`.
> **SCR-07 — Invoice page.** default: the header status `Badge` shows the derived status: `Overdue` for a past-due pending invoice. `getInvoiceEditorData` returns the derived status like every other invoice read — `InvoiceEditor`.
> **SCR-01 — Dashboard.** default: recent invoices show it with the `Overdue` badge — `InvoiceStatusBadge`.
>
> — `screens.md §Screens, SCR-06, SCR-07, SCR-01 default, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** A future query that writes `status = 'OVERDUE'` by hand would bypass the rule; a scanning test fails on any such literal outside the module.
>
> — `adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md, Consequences / Negative, abridged` · full text: [ADR-0005](../adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md)

> **Hard rule:** Where the contract fixes a message (the `updateInvoiceStatus` refusal), the UI shows it **verbatim** from the result's `error`. Reuse existing components; no new primitive here.
>
> — `screens.md §Source, Strings, abridged` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [screens.md](../screens.md) · [server-actions.md](../contracts/server-actions.md) ·
[adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Reads the derived `status` field from the existing invoice DTOs (T07) and `getRecentInvoices` (T06).
- `updateInvoiceStatus` may now return `VALIDATION` with `'This invoice is overdue because its due date has passed. You can still mark it paid.'`.

— `contracts/server-actions.md §Shared overdue rule + §updateInvoiceStatus, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-24 — cross-context

> **Given** a pending invoice whose due date has passed and that the Freelancer never marked overdue
> **When** they open the dashboard and the invoice list
> **Then** the dashboard counts it in the overdue figures, lists its Customer as a Debtor and leaves it out of Expected payments. The invoice list shows it as overdue, includes it when filtered by overdue and leaves it out when filtered by pending, matching what an Assistant reports. Every other place that shows an invoice's status shows it as overdue too, including the dashboard's recent invoices, the customer page and the invoice itself. "Mark as overdue" and "back to pending" are not offered for it. Its stored status is unchanged, and marking it paid works as before
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

(This task owns the on-screen half.)

## Checklist

- [ ] `components/invoices/invoice-row-actions.tsx` — drive menu items off the derived `status`; handle the `VALIDATION` refusal with `toast.error` verbatim + row refresh; drop its hand-written overdue check if it duplicates the rule.
- [ ] `components/invoices/invoices-toolbar.tsx` — the status filter passes through to the service filter (no client-side status logic).
- [ ] `components/invoices/related-invoices-list.tsx`, `components/dashboard/recent-invoices/` — badge from the derived `status`.
- [ ] `types/invoice/types.ts` — remove any client-side OVERDUE derivation; one status field.
- [ ] Remove the last entries from the T02 literal-scan allow-list.
- [ ] `tests/component/invoice-row-actions-derived-overdue.test.tsx` — SCR-05 row menu, paid, status-rejected.

## Edge cases

| Case | Behaviour |
|---|---|
| Page loaded before the due date passed; Mark as Overdue clicked after | `toast.error` with the D-6 message; row refreshes to `Overdue` |
| Hand-marked overdue invoice | same badge and menu as derived overdue |
| Mark as Paid on a derived-overdue row | `toast.success`, badge `Paid` |
| Draft opened from an Assistant link (SCR-07) | header badge "Draft" (unchanged) |

## Definition of Done

- [ ] Component tests show a derived-overdue row with the Overdue badge and a menu without Mark as Overdue / Mark as Pending but with Mark as Paid, the status-rejected toast shows the D-6 message verbatim and refreshes the row, and the overdue literal scan from T02 passes with no allow-list entries left.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
