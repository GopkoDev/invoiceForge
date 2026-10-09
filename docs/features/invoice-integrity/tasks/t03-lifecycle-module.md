---
id: T03
title: "Encode the status lifecycle as a transition table with decideStatusChange and add the new ActionResult detail kinds"
layer: "domain"
deps: []
blocks: ["T07", "T08", "T10", "T15"]
acs: ["AC-04", "AC-04b", "AC-05", "AC-06"]
files_hint: ["lib/helpers/invoice-status.ts", "types/result.ts", "tests/unit/invoice-status.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T03 — Encode the status lifecycle as a transition table with decideStatusChange and add the new ActionResult detail kinds

## Place in the sequence

- **Blocked by:** — · **Blocks:** T07 — Create and duplicate invoices only as drafts…, T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice…, T10 — Decide list status changes and deletes under the row lock…, T15 — Offer only lifecycle-allowed row actions… · **Wave:** 1 — a pure module with no schema dependency.
- **Lane:** own lane. Additive only: keep `applyStatusChange` exported until T07/T10 move every caller (no compile break).

## Why (user story)

> **As a** Freelancer
> **I want** only sensible status changes to be accepted
> **So that** a paid or cancelled invoice cannot be rewound into a draft, deleted, or silently lose its payment date
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task encodes the lifecycle once, as data plus one decision function, so every write path and the UI give the same answer.

## Inlined context

> **Chosen:** Option 1. The 25 pairs become fast unit tests over one function, and the per-path tests only need to prove each path calls it. Refusals come back as ordinary `ActionResult` failures with the spec's explanations … The module keeps the `paidAt` rule: entering paid records the moment, paid → pending clears it, a same-status request is not a change and never touches `paidAt`. … Hand-marked versus derived overdue is told apart by the stored status and the due date, using the shared overdue rule module.
>
> — `adr/0002-…, Decision outcome, abridged` · full text: [ADR-0002](../adr/0002-decide-every-status-change-in-one-pure-lifecycle-module.md)

> `lib/helpers/invoice-status.ts` CHANGED — transition table as data + decideStatusChange (lifecycle, paidAt, create-as-draft, delete-only-drafts). The editor and list import the same table to offer only allowed actions.
>
> — `sad.md §5, internal decomposition + §4 choice 2, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Dates and time zone — the "today" for the overdue rule comes from the Freelancer time zone; due dates are calendar days (mcp-server ADR-0005, ADR-0009). The table must be importable by client components (no `server-only`).
>
> — `sad.md §8, Dates and time zone, abridged` · full text: [sad.md](../sad.md)

Current code: `applyStatusChange(prev, next, now)` in `lib/helpers/invoice-status.ts` accepts any transition (brief D4). Overdue rule module from mcp-server: `lib/services/_shared/overdue.ts` (`todayIn`) — it is `server-only`; pass `today` in as a parameter rather than importing it into a client-shared module.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [server-actions.md](../contracts/server-actions.md) ·
[adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

> | From → To | Allowed when |
> |---|---|
> | `DRAFT → PENDING` | the stored draft passes every draft rule |
> | `PENDING → PAID`, `PENDING → OVERDUE`, `PENDING → CANCELLED` | always |
> | `OVERDUE → PENDING` | stored `OVERDUE` (marked by hand) **and** `dueDate ≥ today` in the Freelancer time zone |
> | `OVERDUE → PAID`, `OVERDUE → CANCELLED` | always |
> | `PAID → PENDING` | always (clears `paidAt`) |
>
> | Refused move | `error` | `suggestion` |
> |---|---|---|
> | any issued status → `DRAFT` | "An issued invoice can never return to draft. Cancel it and duplicate it instead." | `CANCEL_AND_DUPLICATE` |
> | `CANCELLED → *` | "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft." | `DUPLICATE` |
> | `OVERDUE → PENDING` past due | "This invoice is past its due date, so it can't move back to pending. Move its due date first, or mark it paid." | `null` |
> | `DRAFT → CANCELLED` | "A draft can't be cancelled. Delete it instead." | `null` |
> | any other pair | "An invoice can't move from {from} to {to}." | `null` |
>
> Create non-draft: `fieldErrors.status` "A new invoice always starts as a draft. Save it, then issue it by moving it to pending." Delete non-draft: "Only drafts can be deleted. An issued invoice can be cancelled instead; a cancelled invoice is final and stays listed."
>
> — `contracts/server-actions.md §updateInvoiceStatus + §createInvoice + §deleteInvoice, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

New `ActionErrorDetails` kinds in `types/result.ts` (additive):
`{ kind: 'CHANGED_ELSEWHERE'; currentVersion: number }` · `{ kind: 'STATUS_NOT_ALLOWED'; currentStatus: InvoiceStatus; suggestion: 'CANCEL_AND_DUPLICATE' | 'DUPLICATE' | null }` · `{ kind: 'ISSUED_INVOICE_LOCKED' }`.
— `contracts/server-actions.md §ActionResult, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-04 — happy path

> **Given** a Freelancer with invoices in each status
> **When** they change statuses
> **Then** only these changes are accepted: draft to pending; pending to paid, overdue or cancelled; overdue that was marked by hand to pending, while the due date has not passed; overdue to paid or cancelled; paid to pending. Entering paid records the payment date, the moment the invoice was marked paid, and paid to pending clears it. A request for the status the invoice already has is not a status change: it is accepted together with the rest of the save, subject to the other rules, and never touches the payment date. Every other change is refused, and the invoice is left as it was
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-04b — domain invariant

> **Given** a Freelancer creating a new invoice or duplicating an existing one, from the editor or from any other path
> **When** the new invoice is saved with any status other than draft
> **Then** the system refuses and explains that a new invoice always starts as a draft and is issued by moving it to pending. A duplicate is always created as a draft
>
> — `spec.md §5, AC-04b, verbatim` · full text: [spec.md](../spec.md)

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

## Checklist

- [ ] `lib/helpers/invoice-status.ts` — export `TRANSITIONS` (data), `allowedTargets(status, dueDate, today)`, `decideStatusChange({ status, paidAt, dueDate }, target, { now, today })` → `{ kind: 'unchanged' } | { kind: 'change', status, paidAt } | { kind: 'refused', message, suggestion }`, `decideCreateStatus(status)`, `decideDelete(status)`. No `server-only`, no Prisma client import beyond the enum type.
- [ ] Keep `applyStatusChange` exported (marked deprecated) until T10 removes it.
- [ ] `types/result.ts` — the three new `details.kind` members.
- [ ] `tests/unit/invoice-status.test.ts` — 25-pair matrix, same-status `paidAt` untouched, overdue → pending before/on/after due date, create and delete per status.

## Edge cases

| Case | Behaviour |
|---|---|
| Same status requested (5 pairs) | `unchanged`; `paidAt` untouched, even for `PAID` |
| `OVERDUE → PENDING` with due date == today | Allowed (`dueDate ≥ today`) |
| `PENDING` past due (derived overdue) → `PENDING` | Same-status: `unchanged` |
| `PAID → PENDING` | Allowed; `paidAt` cleared |
| Unknown status string | Refused (never persisted) |

## Definition of Done

- [ ] A unit matrix over decideStatusChange covers all 25 from–to pairs (20 refused/allowed per AC-04, 5 same-status accepted with paidAt untouched), creation in each non-draft status and delete of each non-draft status are refused with the contract messages and suggestions, and types/result.ts carries CHANGED_ELSEWHERE, STATUS_NOT_ALLOWED and ISSUED_INVOICE_LOCKED.
- [ ] Module importable from a client component (no `server-only`).
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
