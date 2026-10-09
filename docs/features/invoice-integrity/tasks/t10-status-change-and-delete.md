---
id: T10
title: "Decide list status changes and deletes under the row lock with the lifecycle and the draft rules on issue"
layer: "app"
deps: ["T02", "T03", "T05", "T06", "T09"]
blocks: ["T15", "T21"]
acs: ["AC-04", "AC-05", "AC-06", "AC-10", "AC-14", "AC-23"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/actions/invoice-actions/invoice-actions.ts", "tests/integration/actions/update-invoice-status.test.ts", "tests/integration/services/invoices/delete-invoice.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T10 — Decide list status changes and deletes under the row lock with the lifecycle and the draft rules on issue

## Place in the sequence

- **Blocked by:** T02 — Promote the four staged migrations…, T03 — Encode the status lifecycle as a transition table…, T05 — Bound every computed amount…, T06 — Check the bank account's and every catalogue line product's currency…, T09 — Apply every draft rule on draft saves… · **Blocks:** T15 — Offer only lifecycle-allowed row actions…, T21 — Prove every invoice write path enforces the same rules… · **Wave:** 5 — last of the invoices.ts lane.
- **Lane:** `lib/services/invoices/invoices.ts` lane (T01 → T07 → T08 → T09 → T10), serialized. This task removes the last `applyStatusChange` caller; delete the old export.

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

> **As an** Assistant
> **I want** every invoice rule to live in the one business layer I share with the web app, and to read an invoice's issued details
> **So that** my answers match the PDF, and later write tools cannot bypass what the web app enforces
>
> — `spec.md §4, US-11, verbatim` · full text: [spec.md](../spec.md)

This task makes the list's status change and delete go through the lifecycle on the locked row, so no path can rewind, revive or delete an issued invoice.

## Inlined context

> The module keeps the `paidAt` rule: entering paid records the moment, paid → pending clears it, a same-status request is not a change and never touches `paidAt`. Draft → pending from any path, the list's status change included, also runs every draft rule (currency, amount bounds, due date not before the issue date) over the stored draft under the same lock before the lifecycle accepts it (AC-14, AC-25).
>
> — `adr/0002-…, Decision outcome, abridged` · full text: [ADR-0002](../adr/0002-decide-every-status-change-in-one-pure-lifecycle-module.md)

> `updateInvoiceStatus` takes no version and decides against the locked row's current status (ADR-0002).
>
> — `adr/0004-…, Decision outcome, verbatim` · full text: [ADR-0004](../adr/0004-detect-outdated-views-with-an-invoice-version-counter.md)

> Flow 5: change the status to the target, no version check → begin, lock the invoice row of this owner → not found → not found; target equals current → accepted without a write; lifecycle refuses → refused with the explanation; draft to pending and the stored draft breaks a draft rule → refused with the editor's explanation, still a draft; allowed → write the status, set/clear the payment date, version plus one, commit; snapshot columns untouched so the draft's last save becomes the fixed issued details. Flow 6: lock the row → not found / not draft → refused, only drafts can be deleted / draft → delete the invoice and its lines.
>
> — `sad.md §6, Flows 5 and 6, abridged` · full text: [sad.md](../sad.md)

> **Hard rules:** `updateInvoiceStatus` never touches the snapshot columns (ADR-0001). Every write scoped by owner in its own `WHERE`, the row lock included; another Freelancer's invoice is answered exactly like a missing one. Never a generic `FAILED` for user input.
>
> — `sad.md §8, Issued details / Authorization / Error handling, abridged` · full text: [sad.md](../sad.md)

Code today (commit 87862ef): `updateInvoiceStatus` (`lib/services/invoices/invoices.ts:801`) reads with `findFirst` (no row lock) and calls `refusesManualStatus` + `applyStatusChange`; `deleteInvoice` (`:997`) returns `CONFLICT` for non-drafts and has no lock.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Change |
|---|---|
| `Invoice.status` | written only through `decideStatusChange` under the row lock |
| `Invoice.paidAt` | set on entering `PAID`, cleared on `PAID → PENDING`, untouched on same-status |
| `Invoice.version` | `+ 1` on an allowed move; no bump on same-status |
| issued details | never written here |

Lock: `SELECT … FROM "Invoice" i JOIN "SenderProfile" sp … WHERE i."id" = $id AND sp."userId" = $owner FOR UPDATE OF i`; no rows → `NOT_FOUND`.

— `data-model.md §Entities, Invoice + Access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`updateInvoiceStatus(id, status)` — no version check, one transaction on the locked row:
1. no session / bad enum → `UNAUTHORIZED` / `VALIDATION` "Unknown status."
2. no row or foreign → `NOT_FOUND`.
3. `status = row.status` → `success` with stored `status`, `paidAt`; no write, no bump.
4. table refuses → `VALIDATION`, message below, `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: row.status, suggestion }`.
5. `DRAFT → PENDING` and stored draft breaks a draft rule → `VALIDATION`, editor's messages joined in `error`, `fieldErrors` keyed as in the editor.
6. allowed → write status, `paidAt`, `version + 1` → `success`.

Refusal messages: issued → `DRAFT` "An issued invoice can never return to draft. Cancel it and duplicate it instead." (`CANCEL_AND_DUPLICATE`) · `CANCELLED → *` "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft." (`DUPLICATE`) · `OVERDUE → PENDING` past due "This invoice is past its due date, so it can't move back to pending. Move its due date first, or mark it paid." · `DRAFT → CANCELLED` "A draft can't be cancelled. Delete it instead." · other "An invoice can't move from {from} to {to}."

`deleteInvoice(id)` — locks the row; no row/foreign → `NOT_FOUND`; `status ≠ DRAFT` → **`VALIDATION`** (was `CONFLICT`) "Only drafts can be deleted. An issued invoice can be cancelled instead; a cancelled invoice is final and stays listed." `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus, suggestion: null }`; draft → delete invoice + lines.

— `contracts/server-actions.md §updateInvoiceStatus + §deleteInvoice, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

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

### AC-14 — cross-context

> **Given** an invoice issued before this release whose currency differs from its bank account's
> **When** the Freelancer changes its notes or due date and saves
> **Then** the save succeeds. On an issued invoice only the rules of the fields that actually changed are checked: a changed due date must not be before the issue date (AC-09), while the currency, amount and discount rules are not re-checked, because those fields are fixed. On a draft every rule, the currency rule included, is checked on every save and when it moves to pending from any path. A draft saved before this release with mismatching currencies is therefore blocked on its next save, even a notes-only one, and cannot be issued, with the explanation from AC-11, until the Freelancer fixes it
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — authorization

> **Given** two Freelancers, A and B
> **When** A tries to change the status of, edit, cancel or delete one of B's invoices by referring to it directly
> **Then** the system answers exactly as for an invoice that does not exist, and B's invoice is unchanged
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

(This task owns the list half of AC-10 — the "not checked for freshness" sentence; the editor half is T08.)

## Checklist

- [ ] `lib/services/invoices/invoices.ts` — `updateInvoiceStatus`: lock the row by id + owner (`FOR UPDATE OF i`), read status, paidAt, dueDate and the stored draft fields + items; call `decideStatusChange` (T03) with today in `actor.timeZone`; same-status → return stored values, no write.
- [ ] Draft → pending: run T06 currency checks + T05 draft rules over the **stored** draft; on failure `VALIDATION` with joined messages and editor-keyed `fieldErrors`.
- [ ] Allowed: write `status`, `paidAt`, `version: { increment: 1 }` only — never snapshot columns.
- [ ] `deleteInvoice`: lock the row in a transaction, refuse non-drafts with `VALIDATION` + `STATUS_NOT_ALLOWED`, delete draft + lines.
- [ ] Remove `applyStatusChange` / `refusesManualStatus` if now unused (grep first).
- [ ] `lib/actions/invoice-actions/invoice-actions.ts` — pass through results unchanged (no rule in the action).
- [ ] Tests: extend `tests/integration/actions/update-invoice-status.test.ts` (AC-04 allowed + refused pairs, paidAt set/clear, same-status no bump, AC-05 suggestion, AC-06, AC-10 paid-after-cancel, AC-14 issue-from-list of a mismatching draft, AC-23 foreign); `tests/integration/services/invoices/delete-invoice.test.ts` (draft deleted, each non-draft refused with VALIDATION, foreign NOT_FOUND).

## Edge cases

| Case | Behaviour |
|---|---|
| `PAID → PAID` | `success`, `paidAt` unchanged, no version bump |
| stored `OVERDUE`, due date today → `PENDING` | allowed (due date not passed in the Freelancer time zone) |
| stored `PENDING` past due → `PENDING` | same-status, accepted without write |
| stored `OVERDUE`, due date yesterday → `PENDING` | refused with the past-due message |
| `DRAFT → CANCELLED` | refused "A draft can't be cancelled. Delete it instead." |
| row deleted between list load and click | `NOT_FOUND` |
| delete of a draft cancelled elsewhere | `VALIDATION`, `currentStatus: 'CANCELLED'` |

## Definition of Done

- [ ] Integration tests show updateInvoiceStatus locks the row, accepts a same-status request without a write or version bump, refuses every pair outside the table with the contract message and currentStatus, refuses draft → pending for a stored draft that breaks a draft rule, sets/clears paidAt and bumps version on allowed moves, deleteInvoice refuses non-drafts with VALIDATION, and both answer NOT_FOUND for another Freelancer's invoice.
- [ ] Every existing test whose expectation changes (e.g. delete `CONFLICT` → `VALIDATION`) is listed for the PR.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
