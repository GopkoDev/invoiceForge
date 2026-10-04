---
id: T14
title: "Page overdue invoices and Debtors strictly with totals over every match"
layer: "app"
deps: ["T06"]
blocks: ["T15", "T16", "T18"]
acs: ["AC-12", "AC-13", "AC-18", "AC-18b"]
files_hint: ["types/result.ts", "lib/services/_shared/strict-page.ts", "lib/services/dashboard/assistant-reads.ts", "lib/services/dashboard/queries.ts", "tests/integration/services/dashboard/assistant-overdue-debtors.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T14 — Page overdue invoices and Debtors strictly with totals over every match

## Place in the sequence

- **Blocked by:** T06 — Apply the shared overdue rule to every dashboard figure and show tabs for issued-invoice currencies · **Blocks:** T15 — Page Expected payments by period and compute summary figures for every issued-invoice currency, T16 — Match Customers by current and invoice-copied names and search issued invoices for an Assistant, T18 — Expose the overdue, Debtors, Expected payments and summary figures tools · **Wave:** 3 — the first Assistant read; owns the strict-paging helper and the new error-detail kinds.
- **Lane:** shares `lib/services/dashboard/queries.ts` with T06, T15 and `lib/services/dashboard/assistant-reads.ts` with T15 — serialized by `implement`.
- **Contract fold:** the `ActionErrorDetails` additions in `types/result.ts` are folded into this task, the first implementer (contract-task rule). They are additive; no exhaustive `switch` over `details.kind` exists today, so the change commits green on its own.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** the Freelancer's overdue invoices and Debtors, with amounts per currency and days overdue
> **So that** the Freelancer gets a correct "who owes me" answer in the conversation
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As an** Assistant acting for a Freelancer
> **I want** to list customers, search issued invoices and open one invoice, always knowing whether an answer is complete
> **So that** I can answer specific questions without guessing or adding up partial lists
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task delivers the business-layer reads behind the overdue and Debtors tools, and the strict paging every Assistant list reuses.

## Inlined context

> **Paged reads for the Assistant.** New service functions back the tools: `listOverdueInvoices`, `listDebtorsPage`, … They return `Page<T>` plus totals over every match. Unlike `paginate`, they return `fail('NOT_FOUND', …, { details: { kind: 'PAGE_OUT_OF_RANGE', … } })` for a page past the last one, and never fall back to page 1 (AC-18b). They cap `pageSize` at 50 and report `pageSizeCapped`.
>
> ```ts
>   | { kind: 'PAGE_OUT_OF_RANGE'; total: number; lastPage: number }                       // ★
>   | { kind: 'AMBIGUOUS_REFERENCE'; reference: 'invoice' | 'customer' | 'senderProfile';  // ★
>       candidates: AmbiguousCandidate[] };
> ```
>
> — `contracts/server-actions.md §Shared overdue rule + §ActionResult, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> M->>S: list Debtors for today in the Freelancer time zone, no period
> S->>D: group overdue invoices by Customer and currency with the shared overdue rule, one page plus the number of Debtors
> alt page past the last page → no rows, total count, last page number
> else page exists → Debtors ranked by total overdue amount per currency, each with overdue count and total
> Postcondition: the ranking agrees with the dashboard's Debtors for the entries the dashboard shows
>
> — `sad.md §6, Flow 6, abridged` · full text: [sad.md](../sad.md)

> M->>S: list overdue invoices for today in the Freelancer time zone
> S->>D: one page of rows plus totals per currency over every match, shared overdue rule
>
> — `sad.md §6, Critical flow 1, abridged` · full text: [sad.md](../sad.md)

> The adapter … holds no business rule, so every figure an Assistant gets comes from the same function the dashboard calls (ADR-0002). The Assistant reads are added to the existing `dashboard`, `invoices` and `customers` services rather than to a parallel "assistant" service, because parity is cheapest when there is only one query.
>
> — `sad.md §5, intro, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Dashboard aggregates sum money as `::float8` in raw SQL … Assistant tools reuse the same query functions and one formatter.
>
> — `sad.md §11, risk row 2, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Reads `Invoice` / `Customer` / `SenderProfile` through existing indexes (`Invoice_senderProfileId_idx` + `Invoice_status_idx` + `Invoice_dueDate_idx`; Debtors query measured at 12 ms over 200,000 rows).

— `data-model.md §Invoice, Customer + §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Feeds (via T18) these answer schemas:
- `OverdueInvoicesAnswer = { today, timeZone, rows: InvoiceRow[] (≤50, status overdue, daysOverdue ≥ 0), totals: CurrencyTotal[], pageInfo }` — rows ordered by due date ascending, then invoice number; `totals` per currency over every overdue invoice. Input: `page`, `pageSize`, optional `currency`.
- `InvoiceRow = { invoiceId, invoiceNumber, senderProfile, customer (name copied onto the invoice), status, amount, currency, dueDate, daysOverdue }`.
- `DebtorsAnswer = { today, timeZone, rows: Debtor[] (≤50), totals: DebtorCurrencyTotal[], pageInfo }`; `Debtor = { customer (current name), currency, rank, overdueTotal, overdueCount }` — one row per Customer per currency, ordered by currency then rank; ties by Customer name, then id. `DebtorCurrencyTotal = { currency, debtorCount, overdueTotal, overdueCount }`.
- `CurrencyTotal = { currency, total: DecimalString, count }`.

— `contracts/openapi.yaml §components.schemas tools 1–2, InvoiceRow, CurrencyTotal, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-12 — happy path

> **Given** a Freelancer in the Kyiv time zone with three issued, unpaid invoices: one due yesterday and never marked overdue, one marked overdue by hand, and one due tomorrow
> **When** an Assistant asks for their overdue invoices
> **Then** it receives the first two and not the third. Each row has the customer, invoice number, sender profile, amount, currency, due date and days overdue, together with the total overdue amount and count per currency, computed by invoiceFlow over every overdue invoice, not only the rows on the current page. Days overdue is the number of whole days from the due date to today in the Freelancer time zone, never below 0: the invoice due yesterday shows 1, and an invoice marked overdue by hand before its due date shows 0
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy path

> **Given** a Freelancer with overdue invoices from 9 Customers in two currencies
> **When** an Assistant asks who owes them money
> **Then** it can receive every Debtor, not only the top three, across as many pages as needed, ranked by total overdue amount within each currency, each with the overdue count and total. Debtors take no period: like the dashboard's Debtors, they cover every invoice overdue today. The ranking agrees with the dashboard's Debtors for the entries the dashboard shows
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — domain invariant

> **Given** an Assistant asking for 1,000 invoices or customers in one page
> **When** the answer is returned
> **Then** it contains at most 50 rows and states that the page size was capped at 50. No answer exceeds the cap, and no partial answer is presented as complete. The cap applies to every list, including overdue invoices, Debtors and Expected payments, while totals and counts always cover the full set
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-18b — error

> **Given** a list with 3 pages of matches
> **When** an Assistant asks for page 7
> **Then** it receives no rows and is told that the page does not exist, together with the total number of matches and the last page number. It never receives an earlier page in place of the one it asked for
>
> — `spec.md §5, AC-18b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `PAGE_OUT_OF_RANGE` and `AMBIGUOUS_REFERENCE` (+ `AmbiguousCandidate`) to `ActionErrorDetails` — `types/result.ts`
- [ ] `strictPage({ page, pageSize })` → offset/limit, `pageSizeCapped`; `pageOutOfRange(total, pageSize)` result — `lib/services/_shared/strict-page.ts`
- [ ] Paged overdue-rows and Debtors queries with per-currency totals over every match, using T02's overdue SQL fragment and T06's "today" — `lib/services/dashboard/queries.ts`
- [ ] `listOverdueInvoices(actor, input)`, `listDebtorsPage(actor, input)` — `lib/services/dashboard/assistant-reads.ts`
- [ ] Integration tests incl. agreement with `getDebtors` — `tests/integration/services/dashboard/assistant-overdue-debtors.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Hand-marked overdue, due date in the future | listed, `daysOverdue = 0` |
| Due tomorrow, pending | not listed |
| Customer owing in two currencies | two Debtor rows, ranked within each currency |
| Equal overdue totals | tie broken by Customer name, then id |
| `currency` filter | rows and totals only for that currency |
| `page: 7` of 3 | `NOT_FOUND` + `PAGE_OUT_OF_RANGE { total, lastPage: 3 }`, no rows |
| `pageSize: 1000` | 50 rows, `pageSizeCapped: true`, totals unchanged |
| No overdue invoices | empty rows, empty totals, page 1 is not an error |

## Definition of Done

- [ ] Integration tests show listOverdueInvoices returns the AC-12 rows with days overdue and per-currency totals over every overdue invoice, listDebtorsPage returns all nine Debtors across pages ranked per currency in agreement with getDebtors, a page past the last returns PAGE_OUT_OF_RANGE with total and lastPage, and pageSize 1000 is capped at 50.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
