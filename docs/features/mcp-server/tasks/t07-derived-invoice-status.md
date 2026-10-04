---
id: T07
title: "Return the derived status from every invoice read and filter by the shared rule"
layer: "app"
deps: ["T02"]
blocks: ["T08", "T16"]
acs: ["AC-24"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/services/invoices/select-queries.ts", "lib/services/invoices/helpers.ts", "lib/services/invoices/editor-data.ts", "tests/integration/services/invoices/derived-status.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T07 — Return the derived status from every invoice read and filter by the shared rule

## Place in the sequence

- **Blocked by:** T02 — Add the shared overdue rule module with its SQL, Prisma and TypeScript forms · **Blocks:** T08 — Show the derived overdue status on the invoice list, customer page, invoice page and recent invoices, T16 — Match Customers by current and invoice-copied names and search issued invoices for an Assistant · **Wave:** 2 — parallel with T06.
- **Lane:** own lane (T16/T17 add new files beside these, they do not edit them).

## Why (user story)

> **As a** Freelancer
> **I want** the dashboard and invoice list to treat a past-due unpaid invoice as overdue without my marking it
> **So that** my dashboard and my Assistant agree on who owes me
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task makes every invoice read return the derived status and every status filter use the shared rule, and stops the server from re-marking a date-overdue invoice.

## Inlined context

> - **Derived status.** Every DTO that returns an invoice's `status` (invoice list, recent invoices, customer page, invoice page, `getPaginatedInvoices`, `getInvoicesByCustomer`, `getInvoicesBySenderProfile`, `getInvoice`) returns `OVERDUE` when the shared rule says so, `PENDING` otherwise. The stored column is never written by a read. Display code reads one field.
> - **Status filters.** `status=OVERDUE` / `status=PENDING` filters use the rule's Prisma condition, never the stored status alone (AC-24).
>
> — `contracts/server-actions.md §Shared overdue rule, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> Flow 13 — `W->>S: list invoices with the status filter`; `S->>D: filter by the shared overdue rule, never by the stored status alone`; `D-->>S: the overdue filter includes it, the pending filter leaves it out`; … `U->>W: marks it paid` → `S->>D: set the stored status to paid` (unchanged path). Postcondition: the stored status is unchanged, and the customer page and the invoice page show the same derived status as the Assistant.
>
> — `sad.md §6, Flow 13, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** Shared rule module in code — `lib/services/_shared/overdue.ts` exports a parameterized `Prisma.sql` fragment, a Prisma `where` condition and a single-row TypeScript predicate, each taking `today` computed from `ActingFreelancer.timeZone`. "Mark as overdue" / "back to pending" stop being offered for derived-overdue invoices (AC-24); the stored `OVERDUE` value remains meaningful for hand-marked invoices.
>
> — `adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md, Option 1 + Neutral, abridged` · full text: [ADR-0005](../adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md)

> **Hard rule:** Every read scoped by the acting Freelancer's id in its own `WHERE`; another Freelancer's record is answered exactly like a missing one (AC-08).
>
> — `sad.md §8, Authorization, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. `Invoice.status` is read-only for this task except on the existing `updateInvoiceStatus` path.

## API contract

`updateInvoiceStatus(id, status)` ✎ — new case:

| New case | Result |
|---|---|
| `status` is `OVERDUE` or `PENDING`, and the invoice is overdue only because its due date has passed | `fail('VALIDATION', 'This invoice is overdue because its due date has passed. You can still mark it paid.')` |

Marking it `PAID` works as before. This is the server form of "Mark as overdue / back to pending are not offered" (the UI also hides both actions).

— `contracts/server-actions.md §updateInvoiceStatus, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

No other signature changes.

## Acceptance criteria

### AC-24 — cross-context

> **Given** a pending invoice whose due date has passed and that the Freelancer never marked overdue
> **When** they open the dashboard and the invoice list
> **Then** the dashboard counts it in the overdue figures, lists its Customer as a Debtor and leaves it out of Expected payments. The invoice list shows it as overdue, includes it when filtered by overdue and leaves it out when filtered by pending, matching what an Assistant reports. Every other place that shows an invoice's status shows it as overdue too, including the dashboard's recent invoices, the customer page and the invoice itself. "Mark as overdue" and "back to pending" are not offered for it. Its stored status is unchanged, and marking it paid works as before
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

(This task owns the invoice-read and server-refusal half; the dashboard half is T06, the screens T08.)

## Checklist

- [ ] `lib/services/invoices/select-queries.ts` / `helpers.ts` — map each row's `status` through `derivedStatus(row, today)`; `today = todayIn(actor.timeZone, now)`.
- [ ] `lib/services/invoices/invoices.ts` — `listInvoices` status filter via `overdueWhere(today)` (and its negation for `PENDING`); `getInvoice` derived status; `updateInvoiceStatus` new `VALIDATION` case.
- [ ] `lib/services/invoices/editor-data.ts` — `getInvoiceEditorData` returns the derived status.
- [ ] Customer and sender-profile invoice lists return the derived status.
- [ ] `tests/integration/services/invoices/derived-status.test.ts` — every read above, both filters, the refusal, `PAID` still works, stored status unchanged after reads.

## Edge cases

| Case | Behaviour |
|---|---|
| Hand-marked `OVERDUE`, not yet due, then "back to pending" | allowed (not overdue only by date) |
| Date-overdue invoice → `OVERDUE` or `PENDING` | `VALIDATION` with the D-6 message; stored status unchanged |
| Date-overdue invoice → `PAID` | `ok()`; stored status `PAID` |
| Draft or cancelled past due | status unchanged (`DRAFT` / `CANCELLED`); never derived overdue |
| Filter `PENDING` | excludes date-overdue invoices |

## Definition of Done

- [ ] Integration tests show listInvoices, customer and sender-profile invoice lists, getInvoice and editor data return OVERDUE for a past-due pending invoice without writing the stored status, the OVERDUE filter includes it and PENDING leaves it out, updateInvoiceStatus refuses OVERDUE/PENDING on it with the D-6 message and still marks it PAID.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
