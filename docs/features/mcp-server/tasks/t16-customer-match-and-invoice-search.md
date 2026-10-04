---
id: T16
title: "Match Customers by current and invoice-copied names and search issued invoices for an Assistant"
layer: "app"
deps: ["T07", "T14"]
blocks: ["T17", "T19"]
acs: ["AC-08", "AC-17", "AC-21"]
files_hint: ["lib/services/customers/customers.ts", "lib/services/invoices/assistant-search.ts", "lib/services/sender-profiles/resolve-by-name.ts", "tests/integration/services/invoices/assistant-search.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T16 — Match Customers by current and invoice-copied names and search issued invoices for an Assistant

## Place in the sequence

- **Blocked by:** T07 — Return the derived status from every invoice read and filter by the shared rule, T14 — Page overdue invoices and Debtors strictly with totals over every match (strict paging, `AMBIGUOUS_REFERENCE` kind) · **Blocks:** T17 — Find one invoice by id or by number with an optional sender profile name (reuses the sender-profile resolver), T19 — Expose the customers, invoice search and one-invoice tools · **Wave:** 4.
- **Lane:** own lane (no other task lists these files).

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

This task delivers `listCustomersForAssistant`, `searchInvoicesForAssistant` and the name resolvers behind the customers and search tools.

## Inlined context

> opt a Customer name is given: S->>D: match the Freelancer's Customers by current name and names copied onto their invoices, in part and ignoring case
> alt the name matches no Customer, including another Freelancer's Customer → no such Customer, answered exactly like a name that does not exist
> else the name matches several Customers → the candidate Customers, asking which one is meant
> else one Customer, or no Customer filter → search invoices, issued only unless drafts or cancelled are asked for, notes and lines not searched; one page plus the total match count and total and count per currency over every match, status by the shared overdue rule
>
> — `sad.md §6, Flow 9, abridged` · full text: [sad.md](../sad.md)

> S->>D: Customers whose current name or invoice-copied names match in part, ignoring case, one page plus the total count
> Postcondition: only this Freelancer's Customers appear, with ids later calls can reference
>
> — `sad.md §6, Flow 11, abridged` · full text: [sad.md](../sad.md)

> OQ-S1 — search_invoices accepts a sender-profile *name*, which can match several profiles. … The contract applies the same `AMBIGUOUS_REFERENCE` rule.
>
> — `contracts/api-sync-report.md §B Back-feed, OQ-S1, abridged` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> | Search by Customer, sender profile, status and date ranges (flow 9) | `Invoice_customerId_idx` / `Invoice_senderProfileId_idx`, then filters over at most one Freelancer's invoices |
> | Customer name match, current and invoice-copied, in part and ignoring case (flows 9, 11) | `Customer_userId_idx` and the per-sender-profile invoice scan. `ILIKE '%…%'` cannot use a B-tree, and no trigram index is added: the scan is bounded by one Freelancer's rows |
>
> — `data-model.md §Invoice, Customer, read paths, verbatim` · full text: [data-model.md](../data-model.md)

> **Hard rule:** Every read scoped by the acting Freelancer's id in its own `WHERE`; another Freelancer's record is answered exactly like a missing one (AC-08).
>
> — `sad.md §8, Authorization, verbatim (cut)` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) ·
[server-actions.md](../contracts/server-actions.md)) and follow it. Do not guess.

## Data delta

No DB changes. Reads `Customer` (`userId`, `name`, contact fields) and `Invoice` (`customerId`, `senderProfileId`, `customerName` copied at issue, `status`, `issueDate`, `dueDate`, `invoiceNumberKey`) through existing indexes.

— `data-model.md §Invoice, Customer, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Feeds (via T19):
- `ListCustomersInput = PageInput + { name? (≤100, trimmed, empty = no filter) }` → `CustomersAnswer = { rows: CustomerDetails[] (≤50, ordered by name, then id), pageInfo }`; `CustomerDetails = { customerId, name, companyName, email, phone, taxId, address, city, country, postalCode, defaultCurrency }` (current details; no notes, website or image).
- `SearchInvoicesInput = PageInput + { customerId? | customer?, senderProfileId? | senderProfile?, status?: InvoiceDisplayStatus[] (absent = pending, overdue, paid), invoiceNumber?, issueDateFrom?, issueDateTo?, dueDateFrom?, dueDateTo? }` — id and name of the same record together → `VALIDATION`.
- `InvoiceSearchAnswer = { today, timeZone, rows: InvoiceRow[] (≤50, issue date descending, then invoice number), totals: CurrencyTotal[], pageInfo }`.
- No match (incl. another Freelancer's) → `NOT_FOUND`; several → `VALIDATION` + `AMBIGUOUS_REFERENCE { reference: customer | senderProfile, candidates (2–50) }`.

— `contracts/openapi.yaml §components.schemas tools 5–6, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-08 — authorization

> **Given** an Assistant acting with Freelancer A's key, and an invoice or customer that belongs to Freelancer B
> **When** it asks for that record by its reference: an invoice number (optionally with a sender profile name), a customer name, or a record identifier of the kind earlier answers return
> **Then** the system answers exactly as it would for a reference that does not exist, so B's record is never revealed, not even its existence
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — happy path

> **Given** a Freelancer with 120 issued invoices and 4 drafts for one Customer
> **When** an Assistant searches that Customer's invoices without asking for drafts
> **Then** it receives only issued invoices, at most 50 per page. The answer gives the total number of matches, the total amount and count per currency over every match, and says plainly whether more pages exist. Every row states its status in words. Drafts and cancelled invoices appear only when the Assistant asks for them, and are then labelled as such. A search can be narrowed by Customer, sender profile, status, an issue-date range, a due-date range and part of an invoice number; free text in notes and lines is not searched
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — domain invariant

> **Given** a Customer renamed from "Acme Ltd" to "Acme GmbH", with invoices issued under both names
> **When** an Assistant asks for the invoices of the Customer "Acme GmbH"
> **Then** it receives the invoices issued under both names, because a Customer's invoices belong to the Customer, not to the name copied onto each invoice. Asking for "Acme Ltd" or "acme" finds the same Customer: names match in part and regardless of letter case, against the current name and the names copied onto the Customer's invoices. When several Customers match, the system does not pick one; it lists the candidates and asks which one is meant, as in AC-20
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `resolveSenderProfileByName(actor, name)` → none / one / candidates — `lib/services/sender-profiles/resolve-by-name.ts`
- [ ] `resolveCustomerByName(actor, name)` (current + invoice-copied names, `ILIKE`, owner-scoped) and `listCustomersForAssistant(actor, input)` — `lib/services/customers/customers.ts`
- [ ] `searchInvoicesForAssistant(actor, input)`: resolve names, default issued statuses, derived status via T07 / `overdueWhere`, strict paging, totals over every match — `lib/services/invoices/assistant-search.ts`
- [ ] Integration tests incl. a second Freelancer's records — `tests/integration/services/invoices/assistant-search.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Search without `status` | pending, overdue, paid only; no drafts or cancelled |
| `status: [draft]` | drafts returned, `status: draft` on each row |
| `customer: "acme"` matching one Customer via an old copied name | that Customer's invoices under every name |
| Name matches two Customers | `AMBIGUOUS_REFERENCE`, `reference: customer`, nothing searched |
| Sender-profile name matches two profiles | `AMBIGUOUS_REFERENCE`, `reference: senderProfile` |
| Name/id of Freelancer B's Customer | same `NOT_FOUND` as a missing one |
| `customerId` and `customer` both given | `VALIDATION` |
| Text that only appears in notes or lines | not matched |
| `status: [pending]` with a past-due pending invoice | excluded (it is overdue) |

## Definition of Done

- [ ] Integration tests show the AC-17 search returns only issued invoices at most 50 per page with total matches and per-currency totals over every match, drafts and cancelled only when asked, the AC-21 rename finds both names case-insensitively, several matches return AMBIGUOUS_REFERENCE, and another Freelancer's Customer or sender profile is answered exactly like a missing one.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
