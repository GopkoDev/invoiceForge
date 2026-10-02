---
id: T15
title: "Move updateInvoice and updateInvoiceStatus into the layer with the totals check and the paid-date rule"
layer: "app"
deps: ["T14"]
blocks: ["T20"]
acs: ["AC-02", "AC-18", "AC-19", "AC-23"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/actions/invoice-actions/invoice-actions.ts", "tests/integration/services/invoices/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- The governing rule of this file: **inline the slice the task actually needs, name where it came
from, and keep the link as the fallback for when the slice turns out not to be enough.** A task is
self-contained: it carries its own context instead of sending the executing agent off to reconstruct it.

Every inlined chunk ends with a one-line **provenance signature**:
`<file> §<section>, <identifier>, verbatim|abridged` — e.g. `spec.md §5, AC-02, verbatim`,
`data-model.md §Entities, table order, abridged`. Never «see the spec».

**Inline budget.** Exactly what THIS task needs: only its own acceptance criteria, only the
data-model fields and endpoints it touches. Cut a long chunk to the essential, mark it `abridged`,
and link the full text. `context_budget` in the frontmatter carries the measured number, and an `L`
either gets split or gets its `# justified:` reason on that line — the `tasks` skill checks both.

**Divergence risk.** An inline is a snapshot taken at breakdown time; upstream can move after it.
The source always wins — which is exactly why every chunk carries a signature pointing at where the
truth lives.

**To the executing agent:** work from what is inlined here. If a slice is insufficient, ambiguous,
or contradicts the code in front of you, open the named file for the full text and follow that.
Do not invent the missing part. -->

# T15 — Move updateInvoice and updateInvoiceStatus into the layer with the totals check and the paid-date rule

## Place in the sequence

- **Blocked by:** T14 — createInvoice (moves `helpers.ts`: `verifyInvoiceRelations`, `verifyItemProductsOwnership`) · **Blocks:** T20 — Close the move · **Wave:** 6 (parallel with T16 in the DAG).
- **Lane:** shares `lib/actions/invoice-actions/invoice-actions.ts` and `lib/services/invoices/invoices.ts` with T12, T13, T14, T16 — serialized invoice lane.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** creating, changing and deleting records to follow exactly the rules the web app follows (invoice numbering, amount checks, deletion guards)
> **So that** data changed through me is as trustworthy as data changed in the browser
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers invoice updates and status changes as request-free business functions with the totals-changed confirmation and the paid-date rule enforced inside them.

## Inlined context

> alt full update from the editor or an Assistant → S->>D: loads the invoice where the id and the sender profile's owner match, and checks every referenced record is owned · alt invoice or any referenced record missing or foreign → NOT_FOUND, nothing stored · else stored total differs from the recalculated one and the confirmation doesn't echo both totals → CONFLICT TOTALS_CHANGED with the old and the new total, nothing stored · else rules hold → updates where the id and the owner match, with the paid-date rule · success with the saved totals, status and paid date · else status change only → S->>S: refuses a status the invoices page does not offer (VALIDATION) · S->>D: updates status and paid date where the id and the owner match · alt no row for this id and owner → NOT_FOUND, nothing changed · else updated → success with the status and paid date · Note: paid date rule: entering paid sets it, paid again keeps it, leaving paid clears it
>
> — `sad.md §6, Flow 7, abridged` · full text: [sad.md](../sad.md)

> **Flag for design (flow 7):** the status-change path writes before it knows whether the row exists (owner-scoped update, `P2025 → NOT_FOUND`). But the paid-date rule needs the current status ("paid again keeps it"). So the write either reads first inside a transaction, or it makes the rule conditional in SQL. ADR-0003's fallback note covers the read-then-write-with-owner shape.
>
> — `sad.md §6, Flags from the sequences pass, flow 7, abridged` · full text: [sad.md](../sad.md)

> `updateInvoice`: the checks run in this order, and the first failure wins: 1. `UNAUTHORIZED` → `VALIDATION` (schema) → `NOT_FOUND` (invoice, or new relations not owned). 2. Move: if `senderProfileId` changed … Empty → allocate from B's sequence; typed → manual rules in B. 3. Number: key equals own current key and profile unchanged → keep; otherwise the manual rules of `createInvoice` (`CONFLICT` if taken). 4. Legacy shared number → `CONFLICT`, `fieldErrors.invoiceNumber = ["This invoice number is also used by another invoice. Change it to a free one to save."]`. 5. Legacy totals: recomputed `total` ≠ stored `total` without matching `confirmedTotals` → `CONFLICT`, `details: { kind: 'TOTALS_CHANGED', oldTotal, newTotal }`, `error: "The total of this invoice changes from {oldTotal} to {newTotal}. Confirm to save."`. 6. Status: `applyStatusChange(prev, next)`: entering `PAID` → `paidAt = now`; `PAID → PAID` → unchanged; leaving `PAID` → `null`. · `updateInvoiceStatus` touches **only** `status` and `paidAt`; it never runs the amount, number or legacy checks.
>
> — `architecture-hardening/contracts/server-actions.md §Invoices, updateInvoice + updateInvoiceStatus, abridged` · full text: [server-actions.md](../../architecture-hardening/contracts/server-actions.md)

> | `updateInvoice(actor, id, input: InvoiceFormValues)` | `SavedInvoice` = | order unchanged from hardening … (flow 7) | `updateInvoice(id, data)` |
> | `updateInvoiceStatus(actor, id, status: string)` | `{ status: InvoiceStatus; paidAt: string \| null }` = | `VALIDATION` "Unknown status." → `NOT_FOUND`. Reads the current status and writes inside one transaction, with the owner in both `where` clauses (ADR-0003 read-then-write fallback, flow 7 flag). Entering `PAID` sets `paidAt`, `PAID → PAID` keeps it, leaving `PAID` clears it (AC-23) | `updateInvoiceStatus(id, status)` |
>
> — `contracts/public-api.md §2.6, updateInvoice + updateInvoiceStatus rows, abridged` · full text: [public-api.md](../contracts/public-api.md)

> If Prisma rejects a relation filter inside a unique `where` for some model, that write falls back to `updateMany`/`deleteMany({ where: { id, <owner path> } })` with `count === 0 → NOT_FOUND`.
>
> — `adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md, Consequences / Negative, verbatim` · full text: [ADR-0003](../adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md)

**Current code to move (read it):** `invoice-actions.ts` `updateInvoice` (l.413; the final write today is `update({ where: { id } })` — must carry the owner), `updateInvoiceStatus` (l.807; today `findFirst` owner-scoped then `update({ where: { id } })` by bare id — the check-then-write drift ADR-0003 removes). Wrappers keep `revalidatePath(protectedRoutes.invoices)` + `revalidatePath(protectedRoutes.invoiceEdit(id))` on success.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. `Invoice` owner path `senderProfile.userId = A`; on writes the referenced `customer`, `bankAccount` and every item `product` must also belong to A (AC-19). `InvoiceItem` is written only inside its invoice's transaction. `Invoice (senderProfileId, invoiceNumberKey)` stays unique.

— `data-model.md §Entities, Invoice / InvoiceItem rows + Write rules, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. `updateInvoice(actor, id, input: InvoiceFormValues): Promise<ActionResult<SavedInvoice>>` · `updateInvoiceStatus(actor, id, status: string): Promise<ActionResult<{ status: InvoiceStatus; paidAt: string | null }>>`.

— `contracts/public-api.md §2.6, updateInvoice / updateInvoiceStatus, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-02 — error

> **Given** a signed-in Freelancer fills in a form with invalid values, for example a negative quantity or an unknown invoice status
> **When** they save it
> **Then** the system blocks the save and shows the same plain-language messages next to the same fields as before the change
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — domain invariant

> **Given** an invoice saved before the amount rules existed, whose stored total differs from the total the system recalculates
> **When** an Assistant or A saves a change to it without confirming the new total
> **Then** the system blocks the save and shows the old and the new total for confirmation, as it does today
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — cross-context

> **Given** an Assistant acting for Freelancer A creates or changes an invoice that refers to a customer, sender profile, bank account or product belonging to Freelancer B
> **When** the save runs
> **Then** the save is blocked as if that customer, sender profile, bank account or product did not exist, and nothing is stored
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — domain invariant

> **Given** one of Freelancer A's invoices
> **When** an Assistant acting for A, or A in the browser, marks it as paid, or later moves it out of paid to any other status
> **Then** marking it paid records the payment date, saving an invoice that is already paid as paid again leaves its payment date unchanged, and moving it out of paid clears that date, so a paid date exists only while the invoice is paid
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: `tests/integration/services/invoices/update-invoice.test.ts` (request-free): negative quantity → `VALIDATION` with today's `items.<i>.quantity` message; legacy invoice without `confirmedTotals` → `CONFLICT` `TOTALS_CHANGED` (old/new totals), with matching `confirmedTotals` → saved; B's invoice id → `NOT_FOUND`, B's row byte-identical; A's invoice pointing to B's customer / bank account / product → `NOT_FOUND`, nothing stored.
- [ ] RED: `tests/integration/services/invoices/update-invoice-status.test.ts`: `'SENT'` → `VALIDATION` "Unknown status."; `PENDING → PAID` sets `paidAt`; `PAID → PAID` keeps it; `PAID → PENDING` clears it; B's invoice id → `NOT_FOUND`, B's status/paidAt unchanged.
- [ ] `lib/services/invoices/invoices.ts`: `updateInvoice(actor, id, input)` — today's body and check order with `actor.userId`; the final `tx.invoice.update` `where` carries `{ id, senderProfile: { userId } }` (or the `updateMany` fallback with `count === 0 → NOT_FOUND`).
- [ ] Same file: `updateInvoiceStatus(actor, id, status)` — parse status → `prisma.$transaction`: owner-scoped read of `{ status, paidAt }` → `applyStatusChange` → owner-scoped write; miss → `NOT_FOUND`.
- [ ] `lib/actions/invoice-actions/invoice-actions.ts`: both actions become thin wrappers with today's two `revalidatePath` calls on success.
- [ ] Run `update-invoice.test.ts`, `update-invoice-status.test.ts` (integration/actions) and the editor component tests unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| invoice moved to another of A's sender profiles with an empty number | number allocated from the new profile's sequence; the old profile's counter untouched |
| unchanged number shared by another legacy invoice | `CONFLICT`, `fieldErrors.invoiceNumber` "This invoice number is also used by another invoice. Change it to a free one to save." |
| `confirmedTotals` echoing stale values | `CONFLICT` `TOTALS_CHANGED` again with the current totals |
| invoice deleted between read and write (status path) | owner-scoped write misses → `NOT_FOUND`, nothing changed |
| `updateInvoiceStatus` on a legacy-total invoice | only `status` / `paidAt` change; no amount, number or legacy check |
| `updateInvoice` with `status: PAID` on an already-paid invoice | `paidAt` unchanged |

## Definition of Done

- [ ] both new integration test files pass, including one foreign-record test per function (`NOT_FOUND`, B's row byte-identical — sad.md §10 QG-1)
- [ ] no bare-id write remains in `updateInvoice` / `updateInvoiceStatus` (grep `where: { id }` in `lib/services/invoices/invoices.ts` returns only owner-scoped forms)
- [ ] wrappers are thin; the existing update tests pass with 0 changed expectations
- [ ] every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
