---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-09"
feature_size: "M"
ticket: "editor-ux"
---

# 0002 — Render the preview and the PDF from one invoice document model

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The editor's live preview (`components/invoice-editor/pdf-preview-document.tsx`, HTML) and the PDF the Customer receives (`components/invoice-editor/invoice-pdf-document.tsx`, react-pdf) are written by hand twice. Both carry their own labels, their own subtotal/tax/total locals and format money as `toFixed(2)` plus the currency code ("1234.50 USD"), while the rest of the app shows "$1,234.50" (spec §1, brief). A wording change can reach one and not the other. AC-09 and AC-10 require the preview and the PDF to show identical wording, dates and amounts, including the issued details of an issued invoice.

## Decision drivers

- Spec §6 NFR "PDF / preview parity": 100 % identical text between preview and PDF over the fixture set (draft, issued, USD, UAH, discount, tax, multiple lines).
- Quality goal 2 (document consistency) and spec §6.1 "hidden wording drift in the PDF".
- ADR-0001: the editor's preview must not need the PDF toolkit, so it can be part of the first display.

## Considered options

1. **One document model** — a pure `buildInvoiceDocument(source)` returns every label, party block, line, formatted date and formatted amount; the HTML preview and the react-pdf document only lay it out.
2. **Show the real PDF as the preview** — render the react-pdf blob in the editor; identical by construction, but the editor loads the toolkit on open, re-renders a PDF on every keystroke, and the server cannot render the preview in the first display.
3. **Share only the labels and the formatters** — keep two hand-written layouts that each decide which blocks and rows to show; smallest diff, but conditional content (discount, shipping, issued versus current parties) stays duplicated and drift is only caught by the parity test.

## Decision outcome

**Chosen:** Option 1. The model is the single owner of what the document says; the layouts own only how it looks. It takes either the editor's form (with the current parties for a draft) or an invoice's issued details (for an issued invoice, `invoice-integrity` ADR-0001), computes amounts with the shared decimal module (architecture-hardening ADR-0006) and formats them with the one format module (ADR-0006). The parity test builds the model for each fixture, renders the PDF, extracts its text and compares it with the preview's rendered text.

## Consequences

**Positive**
- A wording or format change is made once and appears in both.
- The preview stays fast HTML, renders on the server and needs no toolkit.

**Negative**
- Two layouts still exist; spacing and typography can differ slightly (the spec requires identical text, not identical pixels).
- One more module and a migration of both layouts onto it.

**Neutral**
- A future server-rendered PDF (ADR-0001 option 2) would reuse the same model.

## Links

- Spec: [[../spec.md]] US-05, AC-09, AC-10
- SAD: [[../sad.md]] §4
- Related ADR: [[0001-load-the-pdf-toolkit-on-demand-through-one-lazy-module]], [[0006-format-money-and-dates-in-one-module-with-a-fixed-en-us-locale]]
