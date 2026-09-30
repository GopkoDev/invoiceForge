---
id: T12
title: "Move invoice numbering, getInvoice, the editor data and the next-number preview into lib/services/invoices"
layer: "app"
deps: ["T3"]
blocks: ["T13", "T14", "T20"]
acs: ["AC-07", "AC-09", "AC-25"]
files_hint: ["lib/services/invoices/numbering.ts", "lib/services/invoices/editor-data.ts", "lib/services/invoices/invoices.ts", "lib/actions/invoice-actions/numbering.ts", "lib/actions/invoice-actions/invoice-actions.ts", "tests/integration/services/invoices/"]
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

# T12 — Move invoice numbering, getInvoice, the editor data and the next-number preview into lib/services/invoices

## Place in the sequence

- **Blocked by:** T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution · **Blocks:** T13 — listInvoices, T14 — createInvoice, T20 — Close the move · **Wave:** 4 (first invoice task; release wave 3 of `sad.md §7`, invoices).
- **Lane:** shares `lib/actions/invoice-actions/invoice-actions.ts` and `lib/services/invoices/` with T13, T14, T15, T16 — one serialized invoice lane; this task opens it.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** to read that Freelancer's invoices, customers, products, custom prices, sender profiles, bank accounts and dashboard figures by naming the Freelancer and, where dates matter, their time zone
> **So that** I can answer the Freelancer's questions without a browser session
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers the invoice reads (one invoice, the new-invoice editor data, the next-number hint) as request-free business functions, and moves the numbering module that T14–T16 write through.

## Inlined context

> invoices/
> ├── invoices.ts        ★ create, update (totals-changed check), status change, duplicate, get, list (AC-26 filters)
> ├── numbering.ts       ✎ moved from lib/actions/invoice-actions/numbering.ts (row lock, normalized key; hardening ADR-0004/0005)
> └── editor-data.ts     ★ customers + products + custom prices for a new invoice (AC-25)
>
> — `sad.md §5, Internal decomposition, lib/services/invoices, abridged` · full text: [sad.md](../sad.md)

> C->>S: asks for the data of a new invoice · S->>D: reads the owner's customers, products, sender profiles with their bank accounts, and custom prices · alt unexpected read failure → FAILED with a plain-language message, reported once · else loaded → success with the same customers, products and custom prices the editor gets · Note: the line is proposed at that Customer's custom price, not at the standard price
>
> — `sad.md §6, Flow 11, abridged` · full text: [sad.md](../sad.md)

> W->>S: calls the read function with the ActingFreelancer and, for a detail page, the record id · S->>D: reads where the id and the owner match · alt read fails unexpectedly → FAILED (reported once) · else no row for this id and owner (missing or foreign) → NOT_FOUND · else row found → success with today's data shape
>
> — `sad.md §6, Flow 3, abridged` · full text: [sad.md](../sad.md)

> | `getInvoice(actor, id)` | `SerializedInvoice` = | `NOT_FOUND` "Invoice not found." | `getInvoice(id)` |
> | `getInvoiceEditorData(actor, invoiceId?)` | `InvoiceEditorData` = (customers, products, sender profiles with bank accounts, custom prices, and the invoice + legacy info when `invoiceId` is given) | `NOT_FOUND` (invoice) · `FAILED` (flow 11, AC-25) | `getInvoiceEditorData(invoiceId?)` |
> | `peekNextInvoiceNumber(actor, senderProfileId)` | `string` | `NOT_FOUND` "Sender profile not found." No lock, no side effect | `generateInvoiceNumber(senderProfileId)` |
>
> — `contracts/public-api.md §2.6, Functions (read rows), verbatim` · full text: [public-api.md](../contracts/public-api.md)

> `generateInvoiceNumber` returns the **hint only** ("assigned on save", AC-06): the first free number from the current sequence, computed without a lock and **without side effects**. It is never sent back as the number. For an existing invoice, `data.invoice` gains `legacy: { storedTotal; recomputedTotal; sharedNumber } | null`. Load failure → `FAILED`. Missing or foreign → `NOT_FOUND`.
>
> — `architecture-hardening/contracts/server-actions.md §Invoices, generateInvoiceNumber + getInvoiceEditorData / getInvoice, abridged` · full text: [server-actions.md](../../architecture-hardening/contracts/server-actions.md)

> **Hard rule:** Every business function returns `ActionResult<T>` itself; `failed()` inside the business function reports the cause once, and wrappers pass results through untouched. Only wrappers produce `UNAUTHORIZED`. `lib/services/**` imports `server-only`, never declares `'use server'`, and never imports `next/headers`, `next/cache`, `next/navigation`, `@/auth` or `next-auth`.
>
> — `sad.md §8, Error handling + Layer boundary, abridged` · full text: [sad.md](../sad.md)

> **Hard rule (parity):** 0 changed or removed expected values in existing automated tests (sole exception: the test of the removed list-all-invoices function).
>
> — `spec.md §6, Behaviour parity — existing checks, verbatim` · full text: [spec.md](../spec.md)

**Current code to move (read it):** `lib/actions/invoice-actions/numbering.ts` (whole module: `normalizeInvoiceNumber`, `formatInvoiceNumber`, `isInvoiceKeyTaken`, `lockSenderProfileRow`, `allocateInvoiceNumber`, `peekNextInvoiceNumber`) · `invoice-actions.ts` `generateInvoiceNumber` (l.139), `getInvoiceEditorData` (l.169), `getInvoice` (l.678). `helpers.ts` (`serializeInvoice`, `computeInvoiceLegacyInfo`, `transformInvoiceToFormData`) is moved by T14; until then import it from its current path (it has no `'use server'` and no `next/*` import).

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only slice this task relies on:

| Entity | Owner path (ADR-0003) | Index serving the read |
|---|---|---|
| `Invoice` | `senderProfile.userId = A` | `Invoice_senderProfileId_idx`; items via `InvoiceItem_invoiceId_idx` |
| `SenderProfile` | `userId = A` | `SenderProfile_userId_idx` (numbering reads `invoiceCounter`) |
| `Customer`, `Product` | `userId = A` | `Customer_userId_idx`, `Product_userId_idx` |
| `CustomPrice` | `customer.userId = A` | `CustomPrice_customerId_idx` |

`Invoice (senderProfileId, invoiceNumberKey)` stays unique; numbering keeps the `SenderProfile` row lock and the `invoiceCounter` sequence.

— `data-model.md §Entities + §Indexes, Invoice / SenderProfile / Customer / Product / CustomPrice rows, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. Business-layer signatures (in-process):

- `getInvoice(actor: ActingFreelancer, id: string): Promise<ActionResult<SerializedInvoice>>`
- `getInvoiceEditorData(actor: ActingFreelancer, invoiceId?: string): Promise<ActionResult<InvoiceEditorData>>`
- `peekNextInvoiceNumber(actor: ActingFreelancer, senderProfileId: string): Promise<ActionResult<string>>`

— `contracts/public-api.md §2.6, getInvoice / getInvoiceEditorData / peekNextInvoiceNumber, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-07 — happy

> **Given** an Assistant acting for Freelancer A, with no browser session
> **When** it asks for A's customers, products, custom prices, sender profiles, bank accounts, invoices or dashboard figures
> **Then** it receives exactly the records and figures A sees on the matching page
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — authorization

> **Given** a signed-in Freelancer A who opens or submits a link or form carrying the identifier of Freelancer B's record
> **When** the page loads or the form is saved
> **Then** A gets the same "not found" outcome as today and B's record is neither shown nor changed
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-25 — cross-context

> **Given** Freelancer A has agreed a custom price with one Customer for one product
> **When** an Assistant acting for A, or A in the invoice editor, loads the data for a new invoice for that Customer
> **Then** both receive the same customers, products and custom prices, and that product's line is proposed at the custom price rather than the product's standard price
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: request-free integration tests in `tests/integration/services/invoices/reads.test.ts` using `actingFreelancerForTest` — `getInvoice` (own → today's `SerializedInvoice` + `legacy`; B's id → `NOT_FOUND`), `getInvoiceEditorData` (no id → same customers/products/custom prices/sender profiles as the editor; A's custom price present for the Customer; B's invoice id → not-found outcome), `peekNextInvoiceNumber` (next number, counter unchanged afterwards; B's profile → `NOT_FOUND`).
- [ ] Move `lib/actions/invoice-actions/numbering.ts` → `lib/services/invoices/numbering.ts` (add `import 'server-only'`); leave `lib/actions/invoice-actions/numbering.ts` as a re-export so `tests/unit/lib/actions/invoice-actions/numbering.test.ts` passes unchanged.
- [ ] `lib/services/invoices/invoices.ts`: `getInvoice(actor, id)` — owner-scoped `findFirst({ id, senderProfile: { userId: actor.userId } })`, `serializeInvoice` + `computeInvoiceLegacyInfo`, `failed()` on error.
- [ ] `lib/services/invoices/invoices.ts`: `peekNextInvoiceNumber(actor, senderProfileId)` — owner check on the profile, then the no-lock peek.
- [ ] `lib/services/invoices/editor-data.ts`: `getInvoiceEditorData(actor, invoiceId?)` — today's five owner-scoped reads and orders, verbatim (profiles `isDefault desc, updatedAt desc`; customers and active products `name asc`).
- [ ] `lib/actions/invoice-actions/invoice-actions.ts`: `getInvoice`, `getInvoiceEditorData`, `generateInvoiceNumber` become thin wrappers: `actingFreelancerFromSession()` → business function → return untouched.
- [ ] Run the existing invoice tests (`tests/unit/lib/actions/invoice-actions/*`, `tests/integration/actions/*invoice*`, component editor tests) unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| `getInvoiceEditorData(actor, <B's or missing id>)` | Contract: `NOT_FOUND`. **Today** the action returns `success` with `initialData: undefined` and the edit page calls `notFound()`. Keep the page outcome identical: the page's `unwrapPageResult` maps `NOT_FOUND` to `notFound()`; if an existing test asserts the `success`+`undefined` shape, the wrapper maps `NOT_FOUND` back to it (parity wins). |
| `getInvoice` of B's invoice | `NOT_FOUND` "Invoice not found." — identical to a never-existing id; B's row unchanged |
| `peekNextInvoiceNumber` for B's sender profile | `NOT_FOUND` "Sender profile not found."; B's `invoiceCounter` unchanged |
| peek called twice | same number both times; no counter advance, no lock |
| data store unreachable | `FAILED` with today's plain-language message, reported to Sentry once; wrapper adds no second report |
| Customer with a custom price for a product | editor data's `customPrices` includes it, so the editor proposes the custom price (AC-25) |

## Definition of Done

- [ ] `tests/integration/services/invoices/reads.test.ts` passes: request-free reads + one foreign-record test per id-taking function (`getInvoice`, `getInvoiceEditorData(invoiceId)`, `peekNextInvoiceNumber`), each asserting `NOT_FOUND` and B's rows byte-identical (sad.md §10 QG-1)
- [ ] `numbering.ts` lives in `lib/services/invoices/`, the old path re-exports, and `numbering.test.ts` passes unchanged
- [ ] the three wrappers call only the business functions; existing invoice tests pass with 0 changed expectations
- [ ] every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
