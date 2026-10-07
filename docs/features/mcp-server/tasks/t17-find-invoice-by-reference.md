---
id: T17
title: "Find one invoice by id or by number with an optional sender profile name"
layer: "app"
deps: ["T16"]
blocks: ["T19"]
acs: ["AC-08", "AC-19", "AC-20"]
files_hint: ["lib/services/invoices/find-by-reference.ts", "tests/integration/services/invoices/find-by-reference.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T17 — Find one invoice by id or by number with an optional sender profile name

## Place in the sequence

- **Blocked by:** T16 — Match Customers by current and invoice-copied names and search issued invoices for an Assistant (provides `resolveSenderProfileByName`) · **Blocks:** T19 — Expose the customers, invoice search and one-invoice tools · **Wave:** 5 — the last business read before the lookup tools.
- **Lane:** own lane (`lib/services/invoices/find-by-reference.ts` is new and touched by no other task).

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** to list customers, search issued invoices and open one invoice, always knowing whether an answer is complete
> **So that** I can answer specific questions without guessing or adding up partial lists
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my data readable only through a valid, unrevoked Personal key of mine, at a bounded rate, and never changeable through it
> **So that** a leaked, revoked or guessed key, or another Freelancer's key, cannot expose or alter my data
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task delivers the business function behind `get_invoice`: one owner-scoped invoice by reference, ambiguity answered with candidates, another Freelancer's invoice indistinguishable from a missing one.

## Inlined context

> C->>M: asks for one invoice by record id, or by invoice number with an optional sender profile name
> S->>D: look up by id, or by number within the named sender profile or across all of them, always scoped to the Freelancer
> alt none, including an invoice of another Freelancer → S-->>M: not found
> else same number in several sender profiles and no sender profile named → candidates: each candidate with sender profile, customer and issue date, asking which one is meant
> else exactly one invoice → the invoice as stored with copied sender and customer details, lines, totals, currency, status, issue and due dates, without bank account numbers or IBANs
>
> — `sad.md §6, Flow 10, abridged` · full text: [sad.md](../sad.md)

> | One invoice by id (flow 10) | `Invoice_pkey`, then the owner check through the sender profile |
> | Invoice by number within one sender profile or across the Freelancer's sender profiles (flow 10, AC-20) | `Invoice_senderProfileId_invoiceNumberKey_key`. Normalize the number with `normalizeInvoiceNumber` |
>
> — `data-model.md §Invoice, Customer, read paths, verbatim` · full text: [data-model.md](../data-model.md)

> **Hard rule (authorization):** Every read scoped by the acting Freelancer's id in its own `WHERE`; another Freelancer's record is answered exactly like a missing one (AC-08).
> **Hard rule (data minimisation):** No bank account number or IBAN in any answer (AC-19); invoices are returned as stored (copied sender/customer details).
>
> — `sad.md §8, Authorization + Data minimisation, abridged` · full text: [sad.md](../sad.md)

> The business functions behind the tools return them as `fail('NOT_FOUND' | 'VALIDATION', message, { details })` … `{ kind: 'AMBIGUOUS_REFERENCE'; reference: 'invoice' | 'customer' | 'senderProfile'; candidates: AmbiguousCandidate[] }`
> **Derived status.** Every DTO that returns an invoice's `status` (… `getInvoice`) returns `OVERDUE` when the shared rule says so, `PENDING` otherwise.
>
> — `contracts/server-actions.md §ActionResult + §Shared overdue rule, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. The returned value feeds `get_invoice` (T19); its shape must be mappable to:

- `InvoiceAnswer`: `invoiceId, invoiceNumber, status, daysOverdue, issueDate, dueDate, currency, sender{senderProfileId, name, legalName, taxId, address, city, country, postalCode, phone, email, website}, customer{customerId, name, companyName, taxId, email, phone, address, city, country, postalCode}, lines[{name, description, unit, quantity, rate, amount}], amounts{subtotal, taxRate, taxAmount, discount, shipping, total, amountPaid}, paymentTerms, terms, notes, poNumber`. **No bank details at all** — `bankName`, `accountName`, `bankAccountNumber`, `bankIban`, `bankSwift` are left out entirely.
- `GetInvoiceInput`: `invoiceId` alone, or `invoiceNumber` (whole number, ignoring case and surrounding spaces) with optional `senderProfile` name (ignoring case).
- Errors: `NOT_FOUND` "No invoice matches that reference. Check the number or ask the Freelancer for it."; `VALIDATION` + `AMBIGUOUS_REFERENCE` (`reference: invoice`, `InvoiceCandidate{invoiceId, invoiceNumber, senderProfile, customer, issueDate}`, 2–50 candidates).

— `contracts/openapi.yaml, schemas GetInvoiceInput / InvoiceAnswer / InvoiceCandidate / ToolError, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-08 — authorization

> **Given** an Assistant acting with Freelancer A's key, and an invoice or customer that belongs to Freelancer B
> **When** it asks for that record by its reference: an invoice number (optionally with a sender profile name), a customer name, or a record identifier of the kind earlier answers return
> **Then** the system answers exactly as it would for a reference that does not exist, so B's record is never revealed, not even its existence
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy path

> **Given** an issued invoice of the Freelancer
> **When** an Assistant asks for it
> **Then** it receives the invoice as currently stored: number, sender profile and customer details as recorded on the invoice (not the Customer's current details), lines, totals, currency, status, issue and due dates. It also gets a link that opens the invoice in Invoice Forge. Bank account numbers and international bank account numbers are not included. A draft or cancelled invoice can be opened the same way and is labelled as a draft or as cancelled
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** a Freelancer whose two sender profiles each have an invoice numbered INV-0012
> **When** an Assistant asks for INV-0012 without naming a sender profile by its name
> **Then** the system does not pick one. It lists both candidates with their sender profile, customer and issue date and asks which one is meant
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `findInvoiceByReference(actor, ref)` in `lib/services/invoices/find-by-reference.ts`: by id → `Invoice_pkey` + owner check through the sender profile in the same `WHERE`.
- [ ] By number: `normalizeInvoiceNumber`, then match `invoiceNumberKey` across the Freelancer's sender profiles, or within the one resolved by `resolveSenderProfileByName` (T16) when a sender profile name is given.
- [ ] Return `AMBIGUOUS_REFERENCE` with `InvoiceCandidate`s when several match and no sender profile is named; propagate a sender-profile-name ambiguity / not-found from the resolver.
- [ ] Select copied `sender*` / `customer*` fields, lines and amounts; never select bank snapshot fields; derive status + `daysOverdue` with the T02 rule and `actor.timeZone`.
- [ ] Integration tests in `tests/integration/services/invoices/find-by-reference.test.ts` for each AC and edge case below.

## Edge cases

| Case | Behaviour |
|---|---|
| Id of another Freelancer's invoice | `NOT_FOUND`, same message as an unknown id |
| Number exists only in Freelancer B's sender profile | `NOT_FOUND`, identical |
| ` inv-0012 ` with spaces / lower case | normalized, found |
| Sender profile name matches none | `NOT_FOUND` (identical for another Freelancer's profile) |
| Sender profile name matches several | `AMBIGUOUS_REFERENCE` with `reference: senderProfile` |
| Draft or cancelled invoice | returned, status `draft` / `cancelled` |
| Pending invoice past due | status `overdue`, `daysOverdue` ≥ 1; stored status unchanged |
| Customer renamed after issue | answer carries the name copied onto the invoice |

## Definition of Done

- [ ] Integration tests show the invoice is returned as stored with copied sender/customer details, lines, amounts, derived status and no bank fields, INV-0012 in two sender profiles without a sender profile name returns both candidates, and another Freelancer's invoice by id or number returns the same NOT_FOUND as a missing one.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
