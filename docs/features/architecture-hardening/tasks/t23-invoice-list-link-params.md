---
id: T23
title: "Parse invoice-list link parameters with fallback defaults and inclusive local date ranges"
layer: "ports"
deps: ["T00", "T14", "T22"]
blocks: ["T24"]
acs: ["AC-26", "AC-27"]
files_hint: ["lib/validations/search-params.ts", "app/(protected)/invoices/page.tsx", "lib/actions/invoice-actions/invoice-actions.ts", "components/invoices/invoices-toolbar.tsx", "components/invoices/invoices-table-footer.tsx", "hooks/use-invoice-filters.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T23 — Parse invoice-list link parameters with fallback defaults and inclusive local date ranges

## Place in the sequence

- **Blocked by:** T14 — Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals, T22 — Carry the browser time zone in a validated tz cookie with day-bound helpers · **Blocks:** T24 — Parse dashboard date ranges with a current-month fallback and key Suspense on currency · **Wave:** wave 3 — input and link validation (spec §1).
- **Lane:** shares files with T08 (`lib/actions/invoice-actions/invoice-actions.ts`), T11 (`lib/actions/invoice-actions/invoice-actions.ts`), T13 (`lib/actions/invoice-actions/invoice-actions.ts`), T14 (`lib/actions/invoice-actions/invoice-actions.ts`), T24 (`lib/validations/search-params.ts`), T26 (`app/(protected)/invoices/page.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** invoice-list and dashboard links with bad or tampered parameters to open with sensible defaults, and date ranges to include the end date
> **So that** a shared or bookmarked link never crashes the page or shows wrong figures
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task makes any bookmarked or tampered invoice-list link open with sensible defaults, controls that match what is shown, and the last day of a range included.

## Inlined context

> | Param | Accepted | Default |
> |---|---|---|
> | `page` | integer ≥ 1 (an out-of-range page falls back to 1) | `1` |
> | `pageSize` | one of `10, 20, 30, 50, 100` | `10` |
> | `sortField` | `createdAt \| issueDate \| dueDate \| total \| invoiceNumber` (`InvoiceSortField`) | `createdAt` |
> | `sortDirection` | `asc \| desc` | `desc` |
> | `status` | `all` or `InvoiceStatus` | `all` |
> | `tab` | `all \| drafts \| final` (`InvoiceTab`) | `all` |
> | `customerId`, `senderProfileId` | string (a foreign id simply matches nothing) | none |
> | `search` | string, trimmed, ≤ 100 | `''` |
> | `dateFrom`, `dateTo` | `YYYY-MM-DD`, with from ≤ to (otherwise both are dropped) | none |
>
> Date bounds: `[startOfDay(dateFrom, tz), startOfDay(dateTo + 1 day, tz))`, so the end is exclusive at the next local midnight (AC-27). `tz` comes from the `tz` cookie (an IANA name validated with `Intl`), falling back to `UTC` (ADR-0010).
>
> — `contracts/server-actions.md §Link parameters, Invoice list, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> Takes **already-parsed** params from `lib/validations/search-params.ts` (see Link parameters). It no longer casts raw strings (L6). `PaginatedInvoiceList` gains `applied: InvoiceListParams`, so the controls show what was applied (AC-26).
>
> — `contracts/server-actions.md §getPaginatedInvoices, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> | default | Loaded. Every control (`Tabs`, status `Select`, page-size `Select`, sort, `Pagination`, date filter) shows `PaginatedInvoiceList.applied`, not the raw link. A date range includes invoices issued any time on its last day, in the browser's time zone (AC-26, AC-27; flow 11) | `InvoicesDataTable`, `Tabs`, `Select`, `Pagination` | wireframe below |
> | default (link fallback) | A link value is malformed or unknown. It is replaced by its default **silently** (no notice), and the controls show the default (AC-26) | as default | wireframe below |
>
> — `screens.md §SCR-02 Invoice list, default rows, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** | Input validation | Every action re-runs the entity's zod schema, **with no `as` casts that bypass it** (L8). **Link parameters are parsed with fallback-to-default schemas**: page ≥ 1, page size ∈ {10, 20, 30, 50, 100} (the sizes the list offers, `components/invoices/invoices-table-footer.tsx:29`), sort field, order, status and tab from enums; anything invalid becomes its default, and the controls show what was applied |
>
> — `sad.md §8, row Input validation, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Time and time zones | Stored as UTC. Day boundaries and "current month" use the validated browser time zone from the `tz` cookie, falling back to UTC. Range ends are exclusive at the next local midnight |
>
> — `sad.md §8, row Time and time zones, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `Invoice.status`, `issueDate`, sort fields | — | existing `Invoice_status_idx`, `Invoice_issueDate_idx` | read-only |

— `data-model.md §Indexes, existing indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `getPaginatedInvoices(params: InvoiceListParams): ActionResult<PaginatedInvoiceList & { applied: InvoiceListParams }>`.

— `contracts/server-actions.md §getPaginatedInvoices, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-26 — error

> **Given** an invoice-list link with an out-of-range or malformed page, a page size not offered in the list, or an unknown sort field, sort order, status or tab
> **When** the Freelancer opens it
> **Then** the list opens with the default for each bad value, and the controls on screen match what is actually shown
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

### AC-27 — happy

> **Given** invoices issued at any time on the last day of a filtered date range, where days are counted in the Freelancer's time zone (the one their browser reports)
> **When** the Freelancer filters the invoice list by that range
> **Then** those invoices are included
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `invoiceListParamsSchema`: each field `.catch(default)` so a bad value never throws; `dateFrom > dateTo` drops both; export `InvoiceListParams` — `lib/validations/search-params.ts`
- [ ] Page: parse `searchParams` with the schema, pass typed params — `app/(protected)/invoices/page.tsx`
- [ ] `getPaginatedInvoices`: accept typed params, date filter `gte startOfLocalDay(from, tz)` / `lt nextMidnight(to, tz)`, clamp an out-of-range page to 1, return `applied` — `lib/actions/invoice-actions/invoice-actions.ts`
- [ ] Controls read `applied` instead of raw params — `components/invoices/invoices-toolbar.tsx`, `invoices-table-footer.tsx`, `hooks/use-invoice-filters.ts`
- [ ] Walk the QG-3 checklist: `?page=-1`, `?page=abc`, `?pageSize=2.5`, `?sortField=items`, `?status=FOO`, `?tab=x`, `?dateFrom=2026-10-05&dateTo=2026-10-01`

## Edge cases

| Case | Behaviour |
|---|---|
| `?page=999` beyond the last page | Page 1 and the pager shows 1 |
| `?pageSize=25` (not offered) | `10`, and the page-size Select shows 10 |
| Invoice issued 23:30 local on `dateTo` | Included (AC-27) |
| `dateFrom` after `dateTo` | Both dropped; no date filter applied or shown |

## Definition of Done

- [ ] each QG-3 malformed link opens the list with defaults and matching controls, no error page (AC-26)
- [ ] an invoice issued late on the range's last local day is listed (AC-27)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
