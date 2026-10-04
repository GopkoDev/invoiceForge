---
id: T15
title: "Page Expected payments by period and compute summary figures for every issued-invoice currency"
layer: "app"
deps: ["T14"]
blocks: ["T18"]
acs: ["AC-14", "AC-15", "AC-16"]
files_hint: ["lib/services/dashboard/assistant-reads.ts", "lib/services/dashboard/queries.ts", "lib/services/dashboard/period.ts", "tests/integration/services/dashboard/assistant-expected-summary.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T15 — Page Expected payments by period and compute summary figures for every issued-invoice currency

## Place in the sequence

- **Blocked by:** T14 — Page overdue invoices and Debtors strictly with totals over every match (strict-page helper, `assistant-reads.ts`) · **Blocks:** T18 — Expose the overdue, Debtors, Expected payments and summary figures tools · **Wave:** 4.
- **Lane:** shares `lib/services/dashboard/queries.ts` with T06, T14 and `lib/services/dashboard/assistant-reads.ts` with T14 — serialized by `implement`.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** the Expected payments for a period, grouped by currency and ordered by due date
> **So that** the Freelancer can plan cash flow from the conversation
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As an** Assistant acting for a Freelancer
> **I want** per-currency summary figures for a Dashboard period, computed by invoiceFlow
> **So that** the numbers I quote match the Freelancer's dashboard exactly
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task delivers `listExpectedPaymentsPage` and `getSummaryFiguresAllCurrencies`, both built on the dashboard's own queries so the figures match to the cent.

## Inlined context

> M->>M: validate the period with the shared calendar-date and 5-year rule
> alt unknown preset, range longer than 5 years, or start after end → the period must be a named preset or a from-to range of at most 5 years whose start is not after its end
> S->>D: pending invoices not overdue by the shared rule, due within the period if one is given, one page plus total and count per currency over every match
> Postcondition: without a period the totals equal the dashboard's Expected payments, with one they equal its planned figure for that period
>
> — `sad.md §6, Flow 7, abridged` · full text: [sad.md](../sad.md)

> S->>D: the dashboard's own summary queries with the shared overdue rule, for every currency on the Freelancer's issued invoices
> S-->>M: received by issue date, planned by due date, overdue by due date, all future payments whatever the period
> Postcondition: every figure equals the dashboard summary to the cent for the same period and time zone
>
> — `sad.md §6, Flow 8, abridged` · full text: [sad.md](../sad.md)

> | Dashboard figures parity | 100 % of figures equal the dashboard to the cent | automated parity test over a seeded multi-currency fixture, run in CI |
> | Latency p95, summary figures, Debtors and Expected payments, for a Freelancer with 5,000 invoices | ≤ 1.5 s server-side |
>
> — `spec.md §6, NFR rows, abridged` · full text: [spec.md](../spec.md)

> **Chosen:** Option 1. (**Union** — dashboard tabs = currencies of the Freelancer's bank accounts ∪ currencies of their issued invoices.)
>
> — `adr/0008 §Decision outcome, abridged` · full text: [ADR-0008](../adr/0008-show-dashboard-currency-tabs-for-bank-account-and-issued-invoice-currencies.md)

> | Time zone and dates | "Today", day and period bounds use the account time zone (UTC until saved); due dates are calendar days compared without shift; periods follow the shared calendar-date / 5-year rule; every Assistant answer names the time zone and period bounds it used. |
>
> — `sad.md §8, Time zone and dates, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Reads `Invoice` through the existing indexes (`Invoice_senderProfileId_idx`, `Invoice_status_idx`, `Invoice_dueDate_idx`).

— `data-model.md §Invoice, Customer, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Feeds (via T18):
- `ListExpectedPaymentsInput = PageInput + { period?: PeriodInput, currency? }` → `ExpectedPaymentsAnswer = { today, timeZone, period: AppliedPeriod, rows: InvoiceRow[] (status pending, daysOverdue null; grouped by currency, ordered by due date, then invoice number), totals: CurrencyTotal[], pageInfo }`.
- `GetSummaryFiguresInput = { period?: PeriodInput }` (absent = `this-month`) → `SummaryFiguresAnswer = { today, timeZone, period, currencies: CurrencySummary[] }` ordered by currency code; `CurrencySummary = { currency, received, planned, overdue, allFuturePayments }`, each `SummaryFigure = { total, count, countedBy: issue_date | due_date | none }`.
- `PeriodInput = { preset: this-month | last-month | this-year | last-year | all-time } | { from, to }`. `AppliedPeriod = { preset | null, from | null, to | null }` (null bounds for `all-time` or no period).
- Invalid period → `VALIDATION`, message and `fieldErrors.period`: "The period must be a named preset (this-month, last-month, this-year, last-year, all-time) or a from–to range of at most 5 years whose start is not after its end."

— `contracts/openapi.yaml §components.schemas tools 3–4, PeriodInput, AppliedPeriod, examples.invalidPeriod, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-14 — happy path

> **Given** a Freelancer with pending invoices in two currencies, some due this month, some later, and one already past due
> **When** an Assistant asks for the Expected payments for this month
> **Then** it receives only the not-yet-overdue invoices due this month in the Freelancer time zone. They are grouped by currency and ordered by due date, with a total and count per currency over every match. The answer states the period's first and last day and the time zone used. The period is optional: asked without one, the Assistant receives every pending invoice, and the totals equal the dashboard's Expected payments; asked with one, the totals equal the dashboard's planned figure for that period
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy path

> **Given** a Freelancer and any Dashboard period
> **When** an Assistant asks for the summary figures for that period
> **Then** every figure equals, to the cent, what the dashboard's summary shows for the same period and time zone. There are exactly four figures, each a total and a count, and each states which date it is counted by:
> - received: paid invoices, counted by issue date within the period, as on the dashboard;
> - planned: pending invoices that are not overdue, counted by due date within the period;
> - overdue: overdue invoices, counted by due date within the period;
> - all future payments: pending and overdue invoices, whatever the period.
>
> They are reported per currency, for every currency that appears on the Freelancer's issued invoices, and never converted. Breakdowns by sender profile or bank account and the dashboard chart are not part of the answer
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — error

> **Given** an Assistant asking for summary figures
> **When** the period is an unknown preset, a custom range longer than 5 years, or a range whose start is after its end
> **Then** the system refuses and explains that the period must be a named preset or a from–to range of at most 5 years whose start is not after its end
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Resolve `PeriodInput` → first/last day in the actor's zone with the shared 5-year rule; `AppliedPeriod` — `lib/services/dashboard/period.ts`
- [ ] Paged Expected-payments rows + per-currency totals reusing the dashboard Expected/planned SQL — `lib/services/dashboard/queries.ts`
- [ ] `listExpectedPaymentsPage(actor, input)` (strict paging from T14), `getSummaryFiguresAllCurrencies(actor, period)` calling `getSummaryStats`' query per issued-invoice currency — `lib/services/dashboard/assistant-reads.ts`
- [ ] Integration tests comparing to `getExpectedPayments` / `getSummaryStats` — `tests/integration/services/dashboard/assistant-expected-summary.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| No period | every pending, not-overdue invoice; `period = { preset: null, from: null, to: null }` |
| Pending invoice already past due | excluded (it is overdue by the shared rule) |
| `all-time` preset | `from`/`to` null in `AppliedPeriod` |
| Currency on invoices but no bank account | still reported (ADR-0008 union) |
| Range of exactly 5 years | accepted; one day more → `VALIDATION` |
| `from` after `to` / unknown preset | `VALIDATION` with the AC-16 message |
| Summary with no period | `this-month` |
| Page past the last (Expected payments) | `PAGE_OUT_OF_RANGE` |

## Definition of Done

- [ ] Integration tests show listExpectedPaymentsPage without a period equals the dashboard Expected payments totals and with this-month equals the planned figure, states period bounds and zone, getSummaryFiguresAllCurrencies equals getSummaryStats to the cent for every currency with countedBy per figure, and the three AC-16 period errors are refused with the AC-16 message.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
