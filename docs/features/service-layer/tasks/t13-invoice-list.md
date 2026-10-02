---
id: T13
title: "Add listInvoices with validated filters and local-date bounds, and delete the unused list-all function"
layer: "app"
deps: ["T3", "T4", "T12"]
blocks: ["T20"]
acs: ["AC-12", "AC-13", "AC-14", "AC-21", "AC-22", "AC-26"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/actions/invoice-actions/invoice-actions.ts", "tests/integration/services/invoices/", "tests/unit/lib/actions/failed-reports-once.test.ts"]
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

# T13 — Add listInvoices with validated filters and local-date bounds, and delete the unused list-all function

## Place in the sequence

- **Blocked by:** T3 — ActingFreelancer + time-zone resolution, T4 — ListQuery / Page / paginate, T12 — invoice reads + numbering move · **Blocks:** T20 — Close the move · **Wave:** 5 (parallel with T14 in the DAG, but same lane).
- **Lane:** shares `lib/actions/invoice-actions/invoice-actions.ts` and `lib/services/invoices/invoices.ts` with T12, T14, T15, T16 — serialized invoice lane.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** every list to accept an optional search text, page and page size and to tell me the total and whether more results exist
> **So that** I never mistake a partial list for the whole one
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** date-based figures and filters to use my time zone, whether I ask in the browser or an Assistant asks for me
> **So that** "this month" and "today" mean my month and my day
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task delivers the invoice list as one validated, paged, zone-aware business function that the invoices page, the customer and sender-profile previews and a future Assistant all share.

## Inlined context

> S->>S: validates the filters against the options the invoices page offers · alt unknown status or sort option, or a date range that is reversed or has one end only → VALIDATION naming the value that is not allowed, no records · else filters valid → S->>S: turns the date range into local-midnight bounds in the resolved zone, end exclusive · Note: an invoice issued at 00:30 on 1 October in Kyiv counts in October, not in September · S->>D: counts, then reads one page where the sender profile's owner matches, with the filters, in the chosen order ending with the id · S-->>C: page envelope of invoices, identical to the invoices page with the same filters · Note: the invoices-page wrapper always passes page size 10
>
> — `sad.md §6, Flow 5, abridged` · full text: [sad.md](../sad.md)

> ```ts
> type InvoiceListQuery = ListQuery & {
>   status?: InvoiceStatus | 'all';                 // default 'all'
>   tab?: 'all' | 'drafts' | 'final';               // default 'all'
>   customerId?: string;
>   senderProfileId?: string;
>   dateFrom?: LocalDate;                           // both or neither; dateFrom <= dateTo
>   dateTo?: LocalDate;                             // inclusive; bound = next local midnight, exclusive
>   sortField?: 'createdAt' | 'issueDate' | 'dueDate' | 'total' | 'invoiceNumber';  // default 'createdAt'
>   sortDirection?: 'asc' | 'desc';                 // default 'desc'
> };
>
> type InvoicePage = Page<InvoiceListItem> & {       // InvoiceListItem =
>   filterOptions: InvoiceFilterOptions;            // = customers + sender profiles for the dropdowns
>   totalInvoices: number;                          // = count without filters (empty-state detection)
> };
> ```
>
> - Search on `invoiceNumber`, `customerName`, `senderName` (=). Order `[sortField] [sortDirection], id`.
> - A foreign or unknown `customerId` / `senderProfileId` filter matches nothing, so it returns an empty page. That is the same answer as for an id that never existed (AC-08).
>
> — `contracts/public-api.md §2.6, InvoiceListQuery + InvoicePage + bullets, abridged` · full text: [public-api.md](../contracts/public-api.md)

> | `status` | not `'all'` and not an `InvoiceStatus` | "Unknown status." (= hardening wording) |
> | `tab` | not one of the three tabs | "Unknown tab. Allowed: all, drafts, final." |
> | `sortField` | not one of the five fields | "Unknown sort option. Allowed: createdAt, issueDate, dueDate, total, invoiceNumber." |
> | `sortDirection` | not `asc`/`desc` | "Unknown sort direction. Allowed: asc, desc." |
> | `dateFrom` / `dateTo` | not a real `YYYY-MM-DD` date, only one end given, or `dateFrom > dateTo` | "Give both dates as YYYY-MM-DD, with the start on or before the end." |
>
> — `contracts/public-api.md §2.6, InvoiceListQuery fieldErrors table, verbatim` · full text: [public-api.md](../contracts/public-api.md)

> | `listInvoices(actor, query?: InvoiceListQuery)` ★ | `InvoicePage` | `VALIDATION` (list + filters) | `getPaginatedInvoices(params)` ✎ maps `items → invoices` and adds its own `applied` (the corrected link params), so the page sees today's `PaginatedInvoiceList & { applied }`. `getInvoicesByCustomer(id, limit)` / `getInvoicesBySenderProfile(id, limit)` → `{ customerId \| senderProfileId, page: 1, pageSize: limit }` → `data.items` |
>
> **Deleted:** `getInvoices()` (the unused list-all function) and its test (spec §1 change 5).
>
> — `contracts/public-api.md §2.6, listInvoices row + Deleted, verbatim` · full text: [public-api.md](../contracts/public-api.md)

> **Chosen:** Option 1. It matches the invoices page's behaviour, which becomes the template for all six lists. · `getPaginatedInvoices` keeps its extra fields (`filterOptions`, `totalInvoices`, `applied`) next to the envelope.
>
> — `adr/0005-page-lists-by-page-number-with-a-shared-page-envelope.md, Decision outcome + Neutral, verbatim` · full text: [ADR-0005](../adr/0005-page-lists-by-page-number-with-a-shared-page-envelope.md)

> **Hard rule:** Web pages keep correcting a malformed link to the documented defaults before they call a business function, as they do today (architecture-hardening AC-25/26). A business function itself refuses invalid input (AC-13, AC-26). The invoices page always passes its own page size, so its first page still shows 10 invoices.
>
> — `spec.md §1, last paragraph, verbatim` · full text: [spec.md](../spec.md)

**Current behaviour to preserve (read `invoice-actions.ts` `getPaginatedInvoices`, l.859):** tab `drafts` → `status = DRAFT`, tab `final` → `status != DRAFT`; the `status` filter applies **only when `tab === 'all'`**, and `applied.status` echoes `'all'` off the all-tab (F-33); `totalInvoices` counts `{ senderProfile: { userId } }` only; `filterOptions` are the owner's customers and sender profiles `name asc`; out-of-range page → 1 (F-32). `getInvoicesByCustomer` / `BySenderProfile` order `createdAt desc`, `take: limit` — the list default. Local bounds today come from `localDayRange(dateFrom, dateTo, getRequestTimeZone())`; in the layer they use `actor.timeZone` with the T3 helpers.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only slice:

| Entity | Owner path | Search fields | Indexes serving the query |
|---|---|---|---|
| `Invoice` | `senderProfile.userId = A` | `invoiceNumber`, `customerName`, `senderName` (as today) | `Invoice_senderProfileId_idx`, `Invoice_customerId_idx`, `Invoice_status_idx`, `Invoice_issueDate_idx`, `Invoice_dueDate_idx` |

— `data-model.md §Entities + §Indexes, Invoice rows, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. `listInvoices(actor: ActingFreelancer, query?: InvoiceListQuery): Promise<ActionResult<InvoicePage>>`; the web wrappers `getPaginatedInvoices`, `getInvoicesByCustomer`, `getInvoicesBySenderProfile` keep their exported names and return shapes.

— `contracts/public-api.md §2.6, listInvoices, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-12 — happy

> **Given** Freelancer A has records in a list
> **When** a picker or an Assistant asks for that list, including the invoices list, without a search text, page or page size
> **Then** it receives the full list in the same order as today, reported as page 1 with the total equal to the number of records, one page in all (none for an empty list) and "no more results". A page given without a page size uses a page size of 10
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — error

> **Given** an Assistant acting for Freelancer A
> **When** it asks for a list with a page or page size that is not a whole number of at least 1 (for example 0, −5 or 2.5), with a search text longer than 100 characters, or with a date range that is reversed or has only one end
> **Then** the system returns no records and tells it which value is invalid and what is allowed
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy

> **Given** Freelancer A's list has 3 pages at the requested page size
> **When** an Assistant or A's page asks for page 99
> **Then** it receives page 1, as the invoices list does today, and the page number in the response is 1. An empty list likewise answers with page 1 and no pages
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — cross-context

> **Given** Freelancer A works in Europe/Kyiv and has an invoice issued at 00:30 local time on 1 October, which is still 30 September in UTC
> **When** A filters invoices or views the dashboard for September in the browser, or an Assistant asks the same while passing Europe/Kyiv
> **Then** the invoice does not count in September in either case (it belongs to A's October), and both return identical figures
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — happy

> **Given** an Assistant acting for Freelancer A passes no time zone or an unknown one
> **When** it asks for date-based figures or a date filter
> **Then** the system uses UTC days and months, exactly as the browser does today when it reports no valid time zone
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — happy

> **Given** Freelancer A's invoices span several statuses, customers, sender profiles and dates
> **When** an Assistant acting for A asks for invoices filtered by status, customer, sender profile and a date range and limited to drafts or to final invoices as the page's tabs allow, sorted by one of the sort options the invoices page offers
> **Then** it receives exactly the invoices, in the same order, that A sees on the invoices page with the same filters. A sort option or status the page does not offer is refused, and the system says which value is not allowed
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: `tests/integration/services/invoices/list-invoices.test.ts` (request-free, `actingFreelancerForTest`): no query → full list as page 1; page 99 → page 1; empty → page 1, 0 pages; each refused value in the table → `VALIDATION` + the named `fieldErrors` key and no items; Kyiv 00:30 1 October invoice absent from September with `Europe/Kyiv`, present with `UTC` per UTC day; a filter on B's `customerId` → empty page; same filters give the same items/order as `getPaginatedInvoices`.
- [ ] `lib/services/invoices/invoices.ts`: `invoiceListQuerySchema` (extends T4's `ListQuery`, strict enums, `LocalDate` both-or-neither and `from <= to`) + `listInvoices(actor, query?)` via T4's `paginate` with `orderBy: [{ [sortField]: sortDirection }, { id: 'asc' }]`, today's tab/status/search/date `where`, `filterOptions`, `totalInvoices`; bounds from the T3 day-bound helpers with `actor.timeZone`.
- [ ] `lib/actions/invoice-actions/invoice-actions.ts`: `getPaginatedInvoices(params)` → session factory → `listInvoices` → `{ invoices: items, total, page, pageSize, totalPages, filterOptions, totalInvoices, applied }` (applied computed as today, incl. the F-33 status echo).
- [ ] Same file: `getInvoicesByCustomer(id, limit)` / `getInvoicesBySenderProfile(id, limit)` → `listInvoices(actor, { customerId | senderProfileId, page: 1, pageSize: limit })` → `data.items` (no `limit` → full list).
- [ ] Delete `getInvoices()` from `invoice-actions.ts` and its row in `tests/unit/lib/actions/failed-reports-once.test.ts` (l.81) — the only test change this feature allows.
- [ ] Run `get-paginated-invoices-*.test.ts` and the invoices page tests unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| `tab: 'drafts'` with `status: 'PAID'` | status filter ignored (tab wins), as today |
| `dateFrom` only, or `dateFrom > dateTo`, or `2026-02-30` | `VALIDATION`, `fieldErrors.dateFrom`/`dateTo` "Give both dates as YYYY-MM-DD, with the start on or before the end.", no items (the page's link parser still drops such a range before calling) |
| `sortField: 'customerName'` | `VALIDATION`, `fieldErrors.sortField` naming the five allowed |
| `customerId` / `senderProfileId` of B, or never existing | empty page, `total: 0` — not `NOT_FOUND` (contract §2.6) |
| equal `sortField` values across pages | `id` tiebreak — no repeat or skip between pages (spec §1 change 4) |
| actor zone unknown / missing | factory already resolved it to `UTC`; bounds are UTC days (AC-22) |
| count and page read race | `total` and `items` may disagree by one; accepted (contract §1.3) |

## Definition of Done

- [ ] `list-invoices.test.ts` passes, including AC-13/AC-26 refusals, AC-14 page fallback, AC-21 Kyiv case and the foreign-filter case
- [ ] `getPaginatedInvoices` / `getInvoicesByCustomer` / `getInvoicesBySenderProfile` are thin wrappers over `listInvoices`; the existing `get-paginated-invoices-*` tests pass unchanged
- [ ] `getInvoices()` and its `failed-reports-once` row are removed; no other expected value changed
- [ ] every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
