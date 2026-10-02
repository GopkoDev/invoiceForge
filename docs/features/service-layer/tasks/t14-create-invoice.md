---
id: T14
title: "Move createInvoice into the layer with owned references and numbering under the row lock"
layer: "app"
deps: ["T12"]
blocks: ["T15", "T16"]
acs: ["AC-15", "AC-16", "AC-19"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/services/invoices/helpers.ts", "lib/actions/invoice-actions/invoice-actions.ts", "lib/actions/invoice-actions/helpers.ts", "tests/integration/services/invoices/"]
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

# T14 — Move createInvoice into the layer with owned references and numbering under the row lock

## Place in the sequence

- **Blocked by:** T12 — invoice reads + numbering move (the allocator now lives in `lib/services/invoices/numbering.ts`) · **Blocks:** T15 — updateInvoice + status, T16 — duplicate + delete · **Wave:** 5.
- **Lane:** shares `lib/actions/invoice-actions/invoice-actions.ts` and `lib/services/invoices/` with T12, T13, T15, T16 — serialized invoice lane. This task also moves `helpers.ts`, which T15/T16 then import from the layer.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** creating, changing and deleting records to follow exactly the rules the web app follows (invoice numbering, amount checks, deletion guards)
> **So that** data changed through me is as trustworthy as data changed in the browser
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers invoice creation as a request-free business function with numbering, amount rules and the ownership of every referenced record enforced inside it.

## Inlined context

> S->>S: validates with the invoice schema and recalculates totals with the exact-decimal module · alt input invalid → VALIDATION with the same field messages as the editor · else → S->>D: opens a transaction and locks the sender profile row where the id and the owner match · S->>D: checks that the customer, bank account and products belong to the same Freelancer · alt sender profile or any referenced record missing or foreign → rolls back, NOT_FOUND as if the record did not exist, nothing stored · else all owned → alt no number given: takes the next number from the sender profile's invoice sequence, skipping used keys · else typed number: looks up the normalized number key within the sender profile · alt typed number already used → rolls back, CONFLICT · else unique clash on a system-assigned number (allocator bug backstop) → reports invoice_number_conflict, CONFLICT, nothing stored · else number free → inserts the invoice and its lines and advances the sequence · success with the new invoice id and number · Postcondition: two saves for one sender profile run one after the other under the row lock, so no two invoices in it share a number
>
> — `sad.md §6, Flow 6, abridged` · full text: [sad.md](../sad.md)

> | number empty | allocate from the profile sequence under the row lock, skip keys taken by manual numbers, advance the counter → `success` |
> | number filled, key free in the profile | keep it; counter untouched → `success` |
> | number filled, key taken | `CONFLICT`, `fieldErrors.invoiceNumber`; rollback, counter untouched |
> | unique violation (P2002) on the key despite the lock (allocator bug backstop) | `CONFLICT` as above + a Sentry alert |
> | rule broken | `VALIDATION` + `fieldErrors`; nothing saved |
> | profile / customer / bank account not owned | `NOT_FOUND` |
> | `status = PAID` | `paidAt = now` |
>
> Stored amounts come only from the shared module (ADR-0006) … Client-sent totals never reach the database. `invoiceNumber` field error: "This invoice number is already used in this sender profile."
>
> — `architecture-hardening/contracts/server-actions.md §Invoices, createInvoice outcome table + amounts + field-error messages, abridged` · full text: [server-actions.md](../../architecture-hardening/contracts/server-actions.md)

> | `createInvoice(actor, input: InvoiceFormValues)` | `SavedInvoice` = | `VALIDATION` (schema + amount rules) → `NOT_FOUND` (profile, customer, bank account or product missing or foreign, AC-19) → `CONFLICT` `fieldErrors.invoiceNumber` "This invoice number is already used in this sender profile." (typed number, AC-16) · `CONFLICT` + `captureMessage('invoice_number_conflict')` (system number clash, backstop) → success: number from the sequence under the row lock when empty (AC-15). `status = PAID` sets `paidAt` (flow 6) | `createInvoice(data)` |
>
> — `contracts/public-api.md §2.6, createInvoice row, verbatim` · full text: [public-api.md](../contracts/public-api.md)

> **Chosen:** Option 1 [owner filter in the write's own `where`]. It is explicit at every call site and needs no infrastructure. It works the same way for nested writes, the numbering row lock and transactions … A pre-read remains only where the logic needs it (invoice count, totals-changed), and it is owner-filtered too.
>
> — `adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md, Decision outcome + Option 1, abridged` · full text: [ADR-0003](../adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md)

> **Hard rule:** Transactions are owned by business functions. A function that needs atomicity (invoice create/update with numbering, account deletion, duplicate) opens its own `prisma.$transaction`. Internal helpers take a `Prisma.TransactionClient`. No public `tx` parameter. · Next.js facilities stay in the web wrappers: `revalidatePath` … called only by wrappers, after a successful result.
>
> — `sad.md §4, inline strategy notes, abridged` · full text: [sad.md](../sad.md)

**Current code to move (read it):** `invoice-actions.ts` `createInvoice` (l.262) with `invoiceNumberConflict`, `resolveManualOrAllocatedNumber` (l.77–117); `helpers.ts` whole module (`verifyInvoiceRelations`, `verifyItemProductsOwnership`, snapshot builders, `serializeInvoice`, `computeInvoiceLegacyInfo`, `transformInvoiceToFormData`). Wrapper keeps `revalidatePath(protectedRoutes.invoices)` on success.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Write rules relied on:

- `Invoice (senderProfileId, invoiceNumberKey)` stays unique. Numbering keeps the `SenderProfile` row lock and the `invoiceCounter` sequence (hardening ADR-0004/0005; SAD §6 flows 6, 8).
- `Invoice` owner path `senderProfile.userId = A`. On writes, the referenced `customer`, `bankAccount` and every item `product` must also belong to A (AC-19).

— `data-model.md §Entities, Write rules + Invoice row, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. `createInvoice(actor: ActingFreelancer, input: InvoiceFormValues): Promise<ActionResult<SavedInvoice>>`; `InvoiceFormValues` and `SavedInvoice` unchanged (`lib/validations/invoice.ts`, hardening `server-actions.md`).

— `contracts/public-api.md §2.6, createInvoice, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-15 — happy

> **Given** an Assistant acting for Freelancer A, and A's sender profile whose invoice sequence proposes the next number
> **When** it creates an invoice with no invoice number
> **Then** the invoice gets the next number from that sender profile's invoice sequence, exactly as when A saves in the browser
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — domain invariant

> **Given** A's page and an Assistant acting for A save new invoices for the same sender profile at the same moment, or the Assistant types a number already used in that sender profile
> **When** both saves finish
> **Then** no two invoices in that sender profile share an invoice number, and a typed duplicate is blocked with the message that the number is already used in this sender profile
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — cross-context

> **Given** an Assistant acting for Freelancer A creates or changes an invoice that refers to a customer, sender profile, bank account or product belonging to Freelancer B
> **When** the save runs
> **Then** the save is blocked as if that customer, sender profile, bank account or product did not exist, and nothing is stored
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: `tests/integration/services/invoices/create-invoice.test.ts` (request-free): empty number → next sequence number, counter advanced; typed free number kept; typed taken number → `CONFLICT` + `fieldErrors.invoiceNumber`, counter untouched; B's sender profile / customer / bank account / product each → `NOT_FOUND`, `Invoice` count unchanged, B's rows byte-identical; two concurrent `createInvoice` calls on one profile → distinct numbers; `status: PAID` → `paidAt` set.
- [ ] Move `lib/actions/invoice-actions/helpers.ts` → `lib/services/invoices/helpers.ts` (`import 'server-only'`, helpers take `userId` / `Prisma.TransactionClient`); keep the old path as a re-export.
- [ ] `lib/services/invoices/invoices.ts`: `createInvoice(actor, input)` — today's body with `actor.userId`, `failed()` / `captureMessage('invoice_number_conflict')` backstop unchanged; no `revalidatePath`.
- [ ] `lib/actions/invoice-actions/invoice-actions.ts`: `createInvoice(data)` → `actingFreelancerFromSession()` → business function → on success `revalidatePath(protectedRoutes.invoices)` → return untouched.
- [ ] Run `create-and-duplicate-invoice.test.ts`, `allocate-invoice-number.test.ts`, `invoice-relations-ownership.test.ts`, `save-p2002-backstop.test.ts` unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| typed number differing only in case/spaces from an existing one | normalized key taken → `CONFLICT` "This invoice number is already used in this sender profile." |
| P2002 on a system-assigned number | `CONFLICT` + Sentry `invoice_number_conflict`; nothing stored |
| item `productId` of B | `NOT_FOUND`; nothing stored (F-48) |
| negative price / zero quantity / discount above subtotal + shipping | `VALIDATION` with today's field messages; nothing stored |
| client-sent `items[].total` | ignored; totals recomputed by the exact-decimal module |
| data store failure mid-transaction | rollback, `FAILED` reported once; counter not advanced |

## Definition of Done

- [ ] `create-invoice.test.ts` passes, including the foreign-reference `NOT_FOUND` cases with B's rows byte-identical and the concurrent-numbering case
- [ ] `helpers.ts` lives in `lib/services/invoices/` and the old path re-exports it
- [ ] `createInvoice` wrapper is thin; the listed existing tests pass with 0 changed expectations
- [ ] every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
