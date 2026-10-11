---
id: T10
title: "Lay out the HTML preview and the PDF from the document model and add the parity test"
layer: "ui"
deps: ["T1", "T8", "T9"]
blocks: ["T11"]
acs: ["AC-09", "AC-10"]
files_hint: ["components/invoice-editor/pdf-preview-document.tsx", "components/invoice-editor/pdf-preview-panel.tsx", "lib/pdf/invoice-pdf-kit.tsx", "hooks/use-pdf-action.ts", "eslint.config.mjs", "tests/unit/invoice-document-parity.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Lay out the HTML preview and the PDF from the document model and add the parity test

## Place in the sequence

- **Blocked by:** T1 — Move the PDF toolkit into one lazy lib/pdf module with a cached, classifying loader, T8 — Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint, T9 — Build the pure invoice document model with its wording in lib/invoice-document · **Blocks:** T11 — Turn the editor store into a per-mount factory provided by context and built from server data · **Wave:** DAG wave 3; delivery wave 2 of spec §1.
- **Lane:** shares files with T1 (`lib/pdf/invoice-pdf-kit.tsx`); T2 (`eslint.config.mjs`, `hooks/use-pdf-action.ts`); T8 (`eslint.config.mjs`); T11 (`components/invoice-editor/pdf-preview-document.tsx`, `components/invoice-editor/pdf-preview-panel.tsx` +1); T16 (`components/invoice-editor/pdf-preview-document.tsx`, `components/invoice-editor/pdf-preview-panel.tsx`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the PDF my Customer receives to show the same wording, dates and money format as the preview in the app
> **So that** what I checked on screen is exactly what my Customer reads
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Makes the PDF the Customer receives say exactly what the preview showed.

## Inlined context

> UI->>UI: builds the document model from the form, or from the issued details of an issued invoice
> UI-->>U: the HTML preview lays out the model from the first display
> U->>UI: chooses Download or Print
> alt draft with unsaved changes → builds the document model from the last save
> else no unsaved changes, or issued → reuses the preview's document model
> UI->>UI: the PDF layout renders the model with the same wording, dates and money
>
> — `sad.md §6, Flow 8, abridged` · full text: [sad.md](../sad.md)

> | PDF / preview parity | 100 % identical text between preview and PDF over the fixture set (draft, issued, USD, UAH, discount, tax, multiple lines) | automated parity test in CI |
>
> — `spec.md §6, NFR «PDF / preview parity», verbatim` · full text: [spec.md](../spec.md)

> The parity test builds the model for each fixture, renders the PDF, extracts its text and compares it with the preview's rendered text.
>
> — `adr/0002-render-preview-and-pdf-from-one-invoice-document-model.md §Decision outcome, ADR-0002, abridged` · full text: [adr/0002-render-preview-and-pdf-from-one-invoice-document-model.md](../adr/0002-render-preview-and-pdf-from-one-invoice-document-model.md)

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

- [ ] `components/invoice-editor/pdf-preview-document.tsx`: take an `InvoiceDocument` prop and render only its fields (no labels or formatting of its own).
- [ ] `lib/pdf/invoice-pdf-kit.tsx`: the react-pdf document takes an `InvoiceDocument`; generate/download/print accept the model.
- [ ] Callers (`pdf-preview-panel.tsx`, `use-pdf-action` callers): build the model once; for a draft with unsaved changes the PDF model comes from the last saved form (`invoice-integrity` AC-02).
- [ ] Remove the T10 entries from the lint rule's temporary ignore list (T8).
- [ ] `tests/unit/invoice-document-parity.test.ts`: for each fixture render the preview (testing-library text) and the PDF (`pdf().toBuffer()` + text extraction, e.g. `pdfjs-dist` dev dependency), normalise whitespace, assert equal.

## Edge cases

| Case | Behaviour |
|---|---|
| draft with unsaved changes | preview shows the live form; the PDF prints the last save (`invoice-integrity` AC-02) |
| issued invoice with since-changed parties | both show the issued details and match line by line (AC-10) |
| a wording change in `lib/invoice-document/wording.ts` | appears in both layouts (AC-10) |

## Definition of Done

- [ ] the parity test passes for all 7 fixtures
- [ ] `grep -n "'[A-Z][a-z]" pdf-preview-document.tsx` shows no hard-coded document label
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
