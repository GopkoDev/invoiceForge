---
id: T9
title: "Build the pure invoice document model with its wording in lib/invoice-document"
layer: "domain"
deps: ["T7"]
blocks: ["T10"]
acs: ["AC-09", "AC-10"]
files_hint: ["lib/invoice-document/", "store/invoice-editor-store/pdf-parties.ts", "tests/unit/lib/invoice-document/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T9 — Build the pure invoice document model with its wording in lib/invoice-document

## Place in the sequence

- **Blocked by:** T7 — Create the lib/format module for money, calendar days and moments with a fixed en-US locale · **Blocks:** T10 — Lay out the HTML preview and the PDF from the document model and add the parity test · **Wave:** DAG wave 2; delivery wave 2 of spec §1.
- **Lane:** shares files with T11 (`store/invoice-editor-store/pdf-parties.ts`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the PDF my Customer receives to show the same wording, dates and money format as the preview in the app
> **So that** what I checked on screen is exactly what my Customer reads
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Creates the one place that decides what the preview and the PDF say.

## Inlined context

> **One document model, two layouts** — a pure `buildInvoiceDocument()` turns the editor form or an issued invoice into every label, line, formatted date and formatted amount the document shows; the HTML preview and the react-pdf document only lay that model out. Wording lives in one place, so a layout wording change reaches both or neither (AC-10).
>
> — `sad.md §4, strategic choice 2, verbatim` · full text: [sad.md](../sad.md)

> The model is the single owner of what the document says; the layouts own only how it looks. It takes either the editor's form (with the current parties for a draft) or an invoice's issued details (for an issued invoice, `invoice-integrity` ADR-0001), computes amounts with the shared decimal module (architecture-hardening ADR-0006) and formats them with the one format module (ADR-0006).
>
> — `adr/0002-render-preview-and-pdf-from-one-invoice-document-model.md §Decision outcome, ADR-0002, abridged` · full text: [adr/0002-render-preview-and-pdf-from-one-invoice-document-model.md](../adr/0002-render-preview-and-pdf-from-one-invoice-document-model.md)

> Amounts are computed by the one shared decimal module `lib/helpers/invoice-calculations.ts` (architecture-hardening ADR-0006), used by both the editor and the services.
>
> — `sad.md §2, Technical constraints, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-09 — happy path

> **Given** a Freelancer with two invoices without unsaved changes, one in a currency that has a symbol and one that doesn't (a US dollar invoice and a hryvnia invoice)
> **When** they open the preview and download the PDF of each, from a device set to any language
> **Then** the preview and the PDF show identical wording, dates and amounts, in the money format the rest of the app uses ("$1,234.50", "UAH 1,234.50"), with the same separators and two decimal places. The editor's line amounts and totals, and the dashboard's Debtors amounts, use the same format, independent of device language. For a draft with unsaved changes the PDF follows `invoice-integrity` AC-02 and prints its last save
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant

> **Given** an issued invoice whose sender profile, Customer and bank account were changed after it was issued
> **When** the Freelancer opens its preview and downloads its PDF
> **Then** both show the issued details and amounts the invoice was issued with, as `invoice-integrity` requires, and they match each other line by line. A wording change made to the invoice layout appears in both, never in only one of them
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Define `InvoiceDocument` (header labels, number, issue/due days, sender/customer/bank blocks, lines with formatted qty/price/amount, summary rows, notes, payment terms) in `lib/invoice-document/types.ts`.
- [ ] Move every literal label from `components/invoice-editor/pdf-preview-document.tsx` and `invoice-pdf-document.tsx` into `lib/invoice-document/wording.ts` (where they differ today, keep the preview's wording and note it in the PR).
- [ ] `buildInvoiceDocument(source)` in `lib/invoice-document/index.ts`: source = `{ kind: 'draft', form, parties }` or `{ kind: 'issued', invoice }` (issued details); amounts via `computeInvoiceAmounts`, formatting via `lib/format`. Reuse/replace `store/invoice-editor-store/pdf-parties.ts`.
- [ ] Unit tests over the 7 fixtures; issued fixture with a since-changed sender/customer/bank still shows the issued details.

## Edge cases

| Case | Behaviour |
|---|---|
| issued invoice whose parties changed after issue | model shows the issued details (AC-10) |
| currency without a symbol (UAH) | `UAH 1,234.50` |
| empty notes / no discount / zero tax | the corresponding rows are omitted the same way for both layouts |

## Definition of Done

- [ ] `tests/unit/lib/invoice-document/` passes for all 7 fixtures
- [ ] the module imports nothing from React or `@react-pdf/renderer`
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
