---
id: T16
title: "Move duplicateInvoice and deleteInvoice into the layer"
layer: "app"
deps: ["T14"]
blocks: ["T20"]
acs: ["AC-08", "AC-24"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/actions/invoice-actions/invoice-actions.ts", "tests/integration/services/invoices/"]
owner: "Dmytro Hopko"
estimate: "S"
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

# T16 — Move duplicateInvoice and deleteInvoice into the layer

## Place in the sequence

- **Blocked by:** T14 — createInvoice (moves `helpers.ts`; the allocator is in the layer since T12) · **Blocks:** T20 — Close the move · **Wave:** 6 (parallel with T15 in the DAG).
- **Lane:** shares `lib/actions/invoice-actions/invoice-actions.ts` and `lib/services/invoices/invoices.ts` with T12, T13, T14, T15 — serialized invoice lane.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** creating, changing and deleting records to follow exactly the rules the web app follows (invoice numbering, amount checks, deletion guards)
> **So that** data changed through me is as trustworthy as data changed in the browser
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** every read and change made on my behalf, from a page or an Assistant, limited to my own records
> **So that** nobody else's data mixes into mine and nobody can reach mine
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task delivers invoice duplication and deletion as request-free, owner-scoped business functions.

## Inlined context

> S->>D: opens a transaction and loads the invoice with its lines where the id and the sender profile's owner match · alt missing or foreign → NOT_FOUND, nothing created · else owned → S->>D: locks the sender profile row and takes the next number from its invoice sequence · S->>D: inserts a draft with the same customer, sender profile and lines, issued today in the actor's zone, due in 30 days · alt unique clash on the assigned number (allocator bug backstop) → reports invoice_number_conflict, FAILED, nothing created · else committed → success with the new draft's id and number · Postcondition: the original invoice is unchanged, and the copy's number has the same format as any system-assigned number
>
> — `sad.md §6, Flow 8, abridged` · full text: [sad.md](../sad.md)

> | `duplicateInvoice(actor, id)` | `{ id: string; invoiceNumber: string }` = | `NOT_FOUND` (invoice, or its sender profile) · `FAILED` "This invoice can't be duplicated. {reasons}" (the source's legacy amounts break the rules; not reported to Sentry) † · `FAILED` "Failed to duplicate invoice." + `captureMessage('invoice_number_conflict')` (number clash backstop). Success: a `DRAFT` with the same customer, sender profile and lines, `issueDate` = today in `actor.timeZone`, due in 30 days, and the next number from the sequence (flow 8, AC-24) | `duplicateInvoice(id)` |
> | `deleteInvoice(actor, id)` | `void` | `NOT_FOUND` · `CONFLICT` "Only draft invoices can be deleted. Consider cancelling instead." † | `deleteInvoice(id)` |
>
> † This branch is preserved from today's code but drawn in no sad.md §6 flow. It is parked as a spec §8 open question owned by `sequences`.
>
> — `contracts/public-api.md §2.6, duplicateInvoice + deleteInvoice rows + † note, verbatim` · full text: [public-api.md](../contracts/public-api.md)

> `FAILED` also covers a source whose stored amounts break the amount rules (e.g. a legacy negative rate): only the amount rules are checked before recomputing, and the action refuses with the message `This invoice can't be duplicated. <reasons>`, where the reasons are the de-duplicated rule messages. There is no `VALIDATION` outcome here. It is a refusal, not a fault: no retry … and it is not reported to Sentry.
>
> — `architecture-hardening/contracts/server-actions.md §Invoices, duplicateInvoice, abridged` · full text: [server-actions.md](../../architecture-hardening/contracts/server-actions.md)

> **Chosen:** Option 1. … Every `update`/`delete` uses Prisma's extended unique `where`, e.g. `{ id, userId }` or `{ id, senderProfile: { userId } }`. A miss (`P2025`) maps to `NOT_FOUND`.
>
> — `adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md, Decision outcome + Option 1, abridged` · full text: [ADR-0003](../adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md)

**Current code to move (read it):** `invoice-actions.ts` `deleteInvoice` (l.645; today owner-scoped `findFirst` then `delete({ where: { id } })` by bare id) and `duplicateInvoice` (l.1025; P2002 backstop at the end). Wrappers keep `revalidatePath(protectedRoutes.invoices)` on success. Today's copy uses `issueDate: new Date()` and `dueDate: now + 30 days`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. `Invoice` owner path `senderProfile.userId = A`; `Invoice (senderProfileId, invoiceNumberKey)` unique; numbering keeps the `SenderProfile` row lock and `invoiceCounter` (flows 6, 8).

— `data-model.md §Entities, Invoice row + Write rules, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. `duplicateInvoice(actor, id): Promise<ActionResult<{ id: string; invoiceNumber: string }>>` · `deleteInvoice(actor, id): Promise<ActionResult>`.

— `contracts/public-api.md §2.6, duplicateInvoice / deleteInvoice, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-08 — authorization

> **Given** an Assistant acting for Freelancer A, and a record (invoice, customer, product, custom price, sender profile or bank account) that belongs to Freelancer B
> **When** it asks to read, change or delete that record by its identifier, or asks for a list that belongs to it (for example the custom prices of B's customer)
> **Then** the system answers exactly as it does for an identifier that never existed, and B's record stays unchanged, so A's side cannot even learn that the record exists
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — happy

> **Given** one of Freelancer A's invoices
> **When** an Assistant acting for A, or A in the browser, duplicates it
> **Then** a new draft is created with the same lines, customer and sender profile, dated today and due in 30 days. It gets the next number from that sender profile's invoice sequence, in the same format as any system-assigned number, and the original invoice is unchanged
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: `tests/integration/services/invoices/duplicate-delete-invoice.test.ts` (request-free): duplicate → `DRAFT`, same customer/profile/lines, next sequence number, due 30 days after issue, original byte-identical; duplicate of a legacy rule-breaking invoice → `FAILED` "This invoice can't be duplicated. …", nothing created, no Sentry call; delete of a draft → gone; delete of a `PENDING` invoice → `CONFLICT`; B's invoice id to both → `NOT_FOUND`, B's rows byte-identical, no invoice created.
- [ ] `lib/services/invoices/invoices.ts`: `duplicateInvoice(actor, id)` — today's body with `actor.userId`; P2002 → `captureMessage('invoice_number_conflict')` + `FAILED`.
- [ ] Same file: `deleteInvoice(actor, id)` — owner-scoped status read, draft-only guard, then owner-scoped delete (`{ id, senderProfile: { userId } }` or `deleteMany` with `count === 0 → NOT_FOUND`).
- [ ] `lib/actions/invoice-actions/invoice-actions.ts`: both actions become thin wrappers with `revalidatePath(protectedRoutes.invoices)` on success.
- [ ] Run `create-and-duplicate-invoice.test.ts`, `duplicate-amount-rules-only.test.ts`, `duplicate-p2002-backstop.test.ts`, `delete-invoice-sentry.test.ts` unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| source amounts break the rules (legacy negative rate) † | `FAILED` "This invoice can't be duplicated. {reasons}", not reported to Sentry, nothing created (contract §2.6) |
| delete of a non-draft invoice † | `CONFLICT` "Only draft invoices can be deleted. Consider cancelling instead."; invoice unchanged (contract §2.6) |
| P2002 on the copy's number | `FAILED` "Failed to duplicate invoice." + Sentry `invoice_number_conflict`; nothing created |
| "dated today" | contract says today in `actor.timeZone`; today's code stores the instant `new Date()`. Keep the stored instant (parity) — it is "today" for the actor — unless the contract owner decides otherwise |
| invoice deleted by another tab between read and delete | owner-scoped delete misses → `NOT_FOUND` |

## Definition of Done

- [ ] `duplicate-delete-invoice.test.ts` passes, including one foreign-record test per function (`NOT_FOUND`, B's rows byte-identical — sad.md §10 QG-1)
- [ ] no bare-id delete remains in `deleteInvoice`
- [ ] wrappers are thin; the listed existing tests pass with 0 changed expectations
- [ ] every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
