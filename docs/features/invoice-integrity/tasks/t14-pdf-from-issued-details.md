---
id: T14
title: "Print the PDF's sender, Customer and bank blocks from the issued details, account number always"
layer: "ui"
deps: []
blocks: []
acs: ["AC-01", "AC-03", "AC-16"]
files_hint: ["lib/helpers/invoice-pdf-helpers.tsx", "components/invoice-editor/invoice-pdf-document.tsx", "tests/integration/services/invoices/pdf-fidelity.test.ts", "tests/unit/lib/invoice-pdf-helpers.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T14 — Print the PDF's sender, Customer and bank blocks from the issued details, account number always

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** 1 — reads existing snapshot columns only; needs no migration and no service change.
- **Lane:** own lane. `components/invoice-editor/invoice-pdf-document.tsx` sits in the folder of the T16–T18 lane, but no later task edits this file, so it runs in parallel.

## Why (user story)

> **As a** Freelancer
> **I want** an issued invoice to keep the sender, Customer and bank details it was issued with
> **So that** re-opening or re-downloading it years later gives the document my Customer actually received
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Customer
> **I want** the invoice PDF to show the payment details that were valid when it was issued, including the account number
> **So that** I can pay it even when the account has no IBAN, and the copy I hold matches the Freelancer's
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** invoices to keep their lines when I deactivate or delete a product
> **So that** an invoice's lines and total never change just because I tidied up my product list
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task makes the PDF print what the invoice holds, not what the related records say today.

## Inlined context

> The PDF builds its sender, Customer and bank blocks from the columns, prints `bankAccountNumber` always and IBAN and SWIFT when present, and takes only the logo from the current sender profile. `senderLogo` stays unused for printing.
>
> — `adr/0001-…, Decision outcome, abridged` · full text: [ADR-0001](../adr/0001-freeze-the-existing-snapshot-columns-at-issue-and-print-from-them.md)

> Flow 7: read the invoice of this owner, its lines, every product its lines reference active or not, and the current sender profile logo → build the sender, Customer and bank blocks from the snapshot columns only → issued legal name, address, bank name, holder and account number, IBAN and SWIFT when present, lines and total as saved. Postcondition: a deleted product's line shows as free text.
>
> — `sad.md §6, Flow 7, abridged` · full text: [sad.md](../sad.md)

> **SCR-03 — Invoice PDF** (reuse `InvoicePDFDocument`, `InvoicePdfPreviewModal`, `PDFPreviewPanel`; no new component):
> - *default — issued:* sender, Customer and bank blocks from the **issued details** (snapshot columns), never the current records; only the logo from the current sender profile.
> - *default — draft:* from the list, the stored draft's last save (AC-02); from the editor, the form as it stands (decision 4).
> - *bank block — no IBAN:* bank name, account holder, account number; no empty IBAN or SWIFT rows.
> - *bank block — with IBAN:* bank name, holder, account number, then IBAN and SWIFT, each only when not empty.
> - *retired-product lines:* deactivated prints as saved; deleted prints as free text; total unchanged.
> - *logo states:* unchanged from architecture-hardening SCR-04. *generating:* existing `Spinner`.
>
> — `screens.md §SCR-03, abridged` · full text: [screens.md](../screens.md)

> **Hard rule (NFR PDF fidelity):** 100 % of fixture issued invoices produce identical PDF text before and after their sender profile, Customer and bank account are changed. This is text, not byte-for-byte as the brief proposed, because the logo stays current (§3). Measured by an automated test over a seeded fixture, run in CI.
>
> — `spec.md §6, NFR PDF fidelity, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** never log form bodies, issued details or bank data; context is ids only.
>
> — `sad.md §8, Logging, abridged` · full text: [sad.md](../sad.md)

Code today (commit 87862ef): `prepareInvoiceDataForPdf` (`lib/helpers/invoice-pdf-helpers.tsx:69`) copies `invoice.senderProfile.*`, `invoice.customer.*`, `invoice.bankAccount.*` (live relations); `invoice-pdf-document.tsx:369` prints bank name and holder but not the account number.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Reads only the existing issued-details columns on `Invoice`: `senderName`, `senderLegalName`, `senderTaxId`, `senderAddress`, `senderCity`, `senderCountry`, `senderPostalCode`, `senderPhone`, `senderEmail`, `senderWebsite`; `customerName`, `customerCompanyName`, `customerTaxId`, `customerEmail`, `customerPhone`, `customerAddress`, `customerCity`, `customerCountry`, `customerPostalCode`; `bankName`, `bankAccountNumber`, `bankIban`, `bankSwift`, `accountName`. Logo from `SenderProfile.logo`; `senderLogo` not printed.

— `data-model.md §Invoice, Existing columns whose meaning this feature fixes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. The internal PDF data rule:

> sender, Customer and bank blocks are built from the snapshot columns, not from `invoice.senderProfile`, `invoice.customer` or `invoice.bankAccount`. The bank block prints `bankName`, `accountName` and `bankAccountNumber`, plus `bankIban` and `bankSwift` when they are not empty (AC-03). A line whose product was deleted prints as free text (AC-16).
>
> — `contracts/server-actions.md §getInvoiceEditorData / getInvoice, PDF data, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-01 — happy path

> **Given** a Freelancer with a paid invoice issued last year
> **When** they change that sender profile's legal name, the Customer's address and the bank account's IBAN, then open the invoice, download its PDF, edit its notes and save
> **Then** the invoice and its PDF still show the old legal name, address and IBAN, and every field other than the notes is unchanged
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — happy path

> **Given** an issued invoice whose bank account has an account number and no IBAN
> **When** the Freelancer downloads the PDF and sends it to the Customer
> **Then** the PDF prints the bank name, account holder and account number from the invoice's issued details, plus the IBAN and SWIFT code when the issued details contain them
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — happy path

> **Given** an invoice with a line for a product the Freelancer later deleted
> **When** they open the invoice or download its PDF
> **Then** the line still shows its description, quantity, price and amount as free text, and the total is unchanged
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

(PDF half only: the notes-only save of AC-01 is T08; the editor's issued-details view is T16.)

## Checklist

- [ ] `lib/helpers/invoice-pdf-helpers.tsx` — `prepareInvoiceDataForPdf` builds sender/customer/bank from the snapshot columns; keep the logo fetch from the current `senderProfile` (id + logo only).
- [ ] `components/invoice-editor/invoice-pdf-document.tsx` — bank block: bank name, account holder, **account number always**, IBAN and SWIFT only when non-empty; sender block prints the legal name where the template shows it; lines render from `InvoiceItem` copies (no product lookup).
- [ ] Editor preview path (form → PDF data) unchanged in shape: it maps the form's issued details into the same props (decision 4).
- [ ] `tests/unit/lib/invoice-pdf-helpers.test.ts` — snapshot ≠ live relation → snapshot wins; IBAN/SWIFT empty → omitted.
- [ ] `tests/integration/services/invoices/pdf-fidelity.test.ts` — seed issued fixtures (pending, overdue, paid, cancelled; with and without IBAN; a deleted-product line), extract PDF text, change sender profile/Customer/bank account, re-extract, assert identical text (logo excluded).

## Edge cases

| Case | Behaviour |
|---|---|
| issued details have IBAN but no SWIFT | IBAN row, no SWIFT row |
| `bankAccountNumber` empty on a legacy row | row omitted rather than printing an empty label |
| sender profile logo changed after issue | PDF shows the current logo (spec §3) |
| sender profile logo removed | existing no-logo state |
| product deleted (`productId` null) | line prints description, quantity, price, amount; total unchanged |
| draft PDF from the list | prints the stored draft's last-save details |

## Definition of Done

- [ ] A CI fixture test shows 100 % of issued fixture invoices produce identical PDF text before and after their sender profile, Customer and bank account change, the bank block prints account number always and IBAN/SWIFT only when present, and a deleted product's line prints as free text with an unchanged total.
- [ ] The built PDF matches SCR-03 states (issued, draft, bank block with/without IBAN, retired-product lines).
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
