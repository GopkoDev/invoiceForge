---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
ticket: "invoice-integrity"
---

# 0001 — Freeze the existing snapshot columns at issue and print from them

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`Invoice` already carries a flat copy of the sender profile, Customer and bank account (`senderName` … `senderWebsite`, `customerName` … `customerPostalCode`, `bankName`, `bankAccountNumber`, `bankIban`, `bankSwift`, `accountName`). Two defects make the copy useless as a record of what was sent: `createInvoice` and `updateInvoice` re-copy it from the current records on every save, whatever the status (brief D2), and the PDF ignores it and reads the live relations (`prepareInvoiceDataForPdf`, brief D1). The PDF also never prints the account number (D8). The spec requires an issued invoice and its PDF to keep the issued details (US-01, US-02, AC-01–AC-03) and the Assistant to answer from them (AC-26).

## Decision drivers

- Quality goal 1 (document fidelity); spec §6 NFR "PDF fidelity": 100 % of fixture issued invoices produce identical PDF text before and after their sender profile, Customer and bank account are changed.
- AC-02: a draft follows the current records on every save, and the PDF of a draft prints the issued details from its last save.
- Spec §3: the logo is not copied; the PDF shows the current logo.
- Spec §3: no automatic repair of existing invoices at release.
- Latency budget: saves no more than 10 % slower (spec §6).

## Considered options

1. **Keep the flat columns, refresh them only for drafts, freeze them from issue** — every reader (PDF, editor, Assistant) reads the columns.
2. **Move the issued details to one versioned `jsonb` column** — one object per invoice, expand/contract migration and backfill.
3. **A separate append-only issue record created at draft → pending** — drafts keep the flat columns, issued invoices read the record.

## Decision outcome

**Chosen:** Option 1. The data already exists with typed columns, so no migration or backfill is needed and existing issued invoices print what they hold from the release on. The rule is a single branch in the service: `updateInvoice` writes the snapshot columns only when the invoice is a draft at the start of the save (issuing from the editor refreshes them in the same transaction, then freezes them); `updateInvoiceStatus` never touches them; `duplicateInvoice` copies from the current records, because the duplicate is a new draft. The PDF builds its sender, Customer and bank blocks from the columns, prints `bankAccountNumber` always and IBAN and SWIFT when present, and takes only the logo from the current sender profile. `senderLogo` stays unused for printing.

## Consequences

**Positive**
- Document fidelity holds by construction for every invoice issued after the release and for the stored copy of every older one.
- The Assistant's invoice answer and the PDF read the same columns (AC-26).
- No schema change for this pillar.

**Negative**
- Adding a printed field later means adding a column, not a key.
- Invoices issued before the release carry the copy from their last save, which may already differ from what was sent; the release does not repair them (accepted, spec §3, §11).

**Neutral**
- A move to a `jsonb` column later stays possible with a one-off migration that reads the flat columns.

## Links

- Spec: [[../spec.md]] US-01, US-02, US-11; AC-01, AC-02, AC-03, AC-26
- SAD: [[../sad.md]] §4
- Related ADR: [[0003-compare-locked-fields-in-one-update-path-and-refuse-any-difference]]
