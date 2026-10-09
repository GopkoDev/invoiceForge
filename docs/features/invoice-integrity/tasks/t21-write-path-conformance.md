---
id: T21
title: "Prove every invoice write path enforces the same rules: status matrix, race, version bump, tenancy and read-only Assistant"
layer: "tests"
deps: ["T07", "T08", "T09", "T10"]
blocks: []
acs: ["AC-23", "AC-24", "AC-25", "AC-26"]
files_hint: ["tests/integration/services/invoices/write-path-conformance.test.ts", "tests/integration/services/invoices/concurrent-save-race.test.ts", "tests/integration/actions/foreign-record-not-found-parity.test.ts", "tests/integration/api/mcp-issued-details.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T21 — Prove every invoice write path enforces the same rules: status matrix, race, version bump, tenancy and read-only Assistant

## Place in the sequence

- **Blocked by:** T07 — Create and duplicate invoices only as drafts under the draft rules, numbered by the issue date's year, T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice and write only the four editable fields on issued invoices, T09 — Apply every draft rule on draft saves and issuing from the editor, refreshing issued details only while the invoice is a draft, T10 — Decide list status changes and deletes under the row lock with the lifecycle and the draft rules on issue · **Blocks:** — · **Wave:** 6 — needs every invoice write path finished.
- **Lane:** own lane (test files only; `foreign-record-not-found-parity.test.ts` is an existing file extended).

## Why (user story)

> **As an** Assistant
> **I want** every invoice rule to live in the one business layer I share with the web app, and to read an invoice's issued details
> **So that** my answers match the PDF, and later write tools cannot bypass what the web app enforces
>
> — `spec.md §4, US-11, verbatim` · full text: [spec.md](../spec.md)

This task is the cross-path evidence the Security review needs: every write path gives the same answer, and the Assistant stays read-only.

## Inlined context

> | Status lifecycle coverage | 100 % of the 25 from–to status pairs tested on every write path: of the 20 pairs between different statuses, each outside AC-04 refused; the 5 same-status pairs accepted with status and payment date unchanged; creation in each non-draft status refused (AC-04b) | automated test matrix, run in CI |
> | Concurrent saves | 0 lost status or payment-date changes across 50 runs of an outdated editor save racing a status change | integration test |
>
> — `spec.md §6, NFR rows "Status lifecycle coverage" + "Concurrent saves", verbatim` · full text: [spec.md](../spec.md)

> **QG-2a** How verify: automated test matrix, run in CI — a unit matrix over `decideStatusChange` plus one integration test per write path proving it calls the module under the row lock (ADR-0002).
> **QG-2b** When: an outdated editor save races a status change from the list (§6 flow 2). How verify: integration test on the throwaway PostgreSQL container, 50 runs with both writes released together, asserting the final status, payment date and the `CONFLICT` refusal (ADR-0004).
>
> — `sad.md §10, QG-2a + QG-2b, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** A future invoice write outside `lib/services` (a script or raw SQL) bypasses the lifecycle, the locked fields and the version bump (ADR-0002, ADR-0004). Mitigation: Lint rules of service-layer ADR-0006; a test asserting every invoice service write path bumps `version` (all except the lazy calendar-day normalisation, ADR-0004); the security review confirms every write path (spec §6.1).
>
> — `sad.md §11, risk "future invoice write outside lib/services", verbatim` · full text: [sad.md](../sad.md)

> Flow 8: the client lists tools → read-only tools only, none changes an invoice or its status; `get_invoice` reads the invoice of this owner with its snapshot columns; not found or another Freelancer's → not found; found → the Customer name and other details from the issued details, the same the PDF prints. Postcondition: nothing is written.
>
> — `sad.md §6, flow 8, abridged` · full text: [sad.md](../sad.md)

> Every write path runs the same ownership check, limiting the acting Freelancer to their own records, together with the new lifecycle, currency, issued-invoice and freshness rules in the shared business layer. Personal keys stay read-only. Security review: Required — must confirm that every invoice write path goes through the new rules.
>
> — `spec.md §6.1, AuthZ/AuthN impact + Security review, abridged` · full text: [spec.md](../spec.md)

Write paths in scope: `createInvoice`, `updateInvoice`, `updateInvoiceStatus`, `duplicateInvoice`, `deleteInvoice` (`lib/services/invoices/invoices.ts`) and their server actions in `lib/actions/invoice-actions/invoice-actions.ts`. — repo at HEAD, the code wins.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Reads `Invoice.version` (`INTEGER NOT NULL DEFAULT 0`, bumped by every service write except the lazy calendar-day normalisation) and `paidAt`; seeds every status directly through the `createInvoice` factory's `status`/`version` overrides (T02).

— `data-model.md §Invoice + §Test fixtures, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Exercises (no change): `updateInvoice` (`CONFLICT` + `CHANGED_ELSEWHERE`; `VALIDATION` + `STATUS_NOT_ALLOWED` / `ISSUED_INVOICE_LOCKED`), `updateInvoiceStatus` (transition table; same status → no write, no version bump), `createInvoice` (non-draft → `VALIDATION`), `deleteInvoice` (non-draft → `VALIDATION`), `NOT_FOUND` "Invoice not found." identical for missing and foreign (AC-23). MCP: tool list unchanged and read-only; `get_invoice` answers from the issued details (AC-24, AC-26).

— `contracts/server-actions.md §updateInvoice, §updateInvoiceStatus, §createInvoice, §deleteInvoice, §Assistant (MCP), abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-23 — authorization

> **Given** two Freelancers, A and B
> **When** A tries to change the status of, edit, cancel or delete one of B's invoices by referring to it directly
> **Then** the system answers exactly as for an invoice that does not exist, and B's invoice is unchanged
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — authorization

> **Given** an Assistant connected with a Freelancer's Personal key
> **When** it tries to change any invoice, including its status
> **Then** no such capability is offered, and the invoice is unchanged. Personal keys are read-only
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

### AC-25 — cross-context

> **Given** a request that does not come from the editor, such as a stale tab or a script using the Freelancer's own session
> **When** it asks for a forbidden status change, an issued-invoice edit beyond the due date, notes, payment terms and PO number, or a draft with mismatching currencies
> **Then** it receives the same refusal and explanation the editor would get, and nothing is stored
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — cross-context

> **Given** an issued invoice whose Customer's name the Freelancer changed after issuing it
> **When** an Assistant asks for that invoice
> **Then** the answer shows the Customer name from the invoice's issued details, the same name the PDF prints
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tests/integration/services/invoices/write-path-conformance.test.ts` — 25-pair matrix through `updateInvoice` (with current `loadedVersion`) and `updateInvoiceStatus`; creation in each non-draft status; delete per status; version bump asserted on every successful write, none on same-status or refusals; AC-25: a raw server-action call with a session (no editor) gets the same `error`/`details` as the editor for a forbidden move, a locked-field edit and a mismatched-currency draft, nothing stored.
- [ ] `tests/integration/services/invoices/concurrent-save-race.test.ts` — 50 runs: load at version v, release `updateInvoiceStatus(PAID)` and `updateInvoice(loadedVersion v)` together; assert final status PAID with `paidAt`, the editor save `CONFLICT` whenever it ran second, 0 lost changes.
- [ ] `tests/integration/actions/foreign-record-not-found-parity.test.ts` — extend: B's invoice via update, status change (incl. cancel), delete, duplicate → same `NOT_FOUND` as a missing id; B's row unchanged.
- [ ] `tests/integration/api/mcp-issued-details.test.ts` — tool list contains no write tool; `get_invoice` after a Customer rename returns the issued `customerName`, matching the PDF block builder from T14.

## Edge cases

| Case | Behaviour |
|---|---|
| Race where the editor save commits first | Save accepted (version matched), then status change applies on top; still no lost change |
| Same-status request on a paid invoice | Accepted, `paidAt` and `version` unchanged |
| Overdue → pending, stored overdue, due date passed | Refused on both paths with the past-due message |
| Foreign id vs random cuid | Byte-identical `NOT_FOUND` result |
| Lazy calendar-day normalisation | Does not bump `version` (the only allowed exception) |

## Definition of Done

- [ ] CI integration tests cover the 25-pair matrix on updateInvoice and updateInvoiceStatus plus creation in each non-draft status, 50 races of an outdated editor save vs a status change with 0 lost changes, every invoice service write bumping version, NOT_FOUND parity for another Freelancer's invoice on every write path, a session-only caller getting the editor's refusals, and the MCP tool list being read-only with get_invoice returning the issued Customer name.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
