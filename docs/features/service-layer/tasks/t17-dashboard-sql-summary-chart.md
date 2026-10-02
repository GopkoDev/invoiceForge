---
id: T17
title: "Build the dashboard SQL for currency tabs, summary stats and the chart, with the old-vs-new parity harness"
layer: "app"
deps: ["T3", "T5"]      # task ids that must finish first
blocks: ["T18"]         # task ids waiting on this one — the inverse of `deps` (markdown only)
acs: ["AC-05", "AC-07", "AC-21", "AC-22"]
files_hint: ["lib/services/dashboard/", "tests/integration/services/dashboard/"]
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

# T17 — Build the dashboard SQL for currency tabs, summary stats and the chart, with the old-vs-new parity harness

## Place in the sequence

- **Blocked by:** T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution; T5 — Wrap the current dashboard actions in dashboard.<section> Sentry spans · **Blocks:** T18 — Build the dashboard SQL for sender accounts, recent invoices, Debtors and Expected payments · **Wave:** 4 (DAG level). It opens release wave 4 of sad.md §7 (dashboard on SQL). The old in-memory actions stay in place, because the parity harness compares against them.
- **Lane:** shares `lib/services/dashboard/` and `tests/integration/services/dashboard/` with T18, so the two are serialized. The web wrappers are **not** switched here (T19).

## Why (user story)

> **As a** Freelancer
> **I want** my dashboard figures (revenue, the chart, sender accounts, Debtors and Expected payments) to match today's to the cent and to appear in a stable order
> **So that** I can rely on them as my invoice history grows
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As an** Assistant acting for a Freelancer
> **I want** to read that Freelancer's invoices, customers, products, custom prices, sender profiles, bank accounts and dashboard figures by naming the Freelancer and, where dates matter, their time zone
> **So that** I can answer the Freelancer's questions without a browser session
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers the first three request-free dashboard sections (currency tabs, summary stats, chart) as owner-joined SQL, plus the parity harness that proves they equal today's figures.

## Inlined context

> **Chosen:** Option 1. […] `$queryRaw` tagged templates + zod row parsing. One parameterized query per section in `lib/services/dashboard/queries.ts`. Every query joins `SenderProfile` and filters `sp."userId" = ${actor.userId}`. Ordering and top-three limits (`ORDER BY … LIMIT`) happen in SQL. Rows are parsed with zod: `bigint` count → number, and each exact two-decimal `numeric` sum → `number` once, so business functions return today's dashboard DTOs unchanged.
>
> — `adr/0004 §Decision outcome + §Considered options, option 1, abridged` · full text: [0004](../adr/0004-aggregate-dashboard-figures-in-parameterized-raw-sql.md)

> SQL identifiers must be quoted to match Prisma's model names (`"Invoice"`, `"senderProfileId"`).
>
> — `adr/0004 §Consequences, Negative, verbatim`

> | Money | Unchanged: `Decimal(10,2)` at rest, one exact-decimal module (hardening ADR-0006). **Dashboard sums are `SUM(numeric)` in SQL. The row parser converts each already-exact two-decimal sum to a `number` once, so business functions return today's dashboard DTOs (`types/dashboard/types.ts`) unchanged. No JS addition of amounts** | ADR-0004 |
>
> — `sad.md §8, Money row, verbatim` · full text: [sad.md](../sad.md)

> S->>S: uses the zone resolved by the factory, UTC when missing or unknown
> S->>D: one aggregate query per section, joined on the owner, bucketed by local day and month in that zone
> D-->>S: one row per group or item displayed, with exact sums
> […]
> S-->>T: the same sections, with identical figures for the same zone
>
> — `sad.md §6, Flow 12 steps 8–10 and 14, abridged` · full text: [sad.md](../sad.md)

> alt unexpected database failure: BL->>BL: reports the cause to error monitoring once · BL-->>C: FAILED with a plain-language message
>
> — `sad.md §6, Critical flow 2, error branch, abridged`

> - **`period` omitted = all time** (today's `appliedRange === undefined`). […]
> - The layer turns `period` into `[startOfLocalDay(from), startOfLocalDay(to + 1))` in `actor.timeZone`, and SQL buckets use `AT TIME ZONE` with that same zone (AC-21, AC-22).
> - `VALIDATION` `fieldErrors.period` "Give both dates as YYYY-MM-DD, with the start on or before the end." for a malformed or reversed period · `fieldErrors.currency` "Unknown currency." for a value outside `Currency` ★.
> - Return types are today's DTOs in `types/dashboard/types.ts`, unchanged (=). […] Each section runs in the Sentry span `dashboard.<section>`.
>
> — `contracts/public-api.md §2.7, DashboardPeriod notes, abridged` · full text: [public-api.md](../contracts/public-api.md)

> **Hard rule:** Every dashboard query also has a two-Freelancer test proving B's invoices never count toward A's figures.
>
> — `sad.md §10, QG-1 How verify, abridged`

> **Hard rule:** "rows returned by each dashboard query ≤ the number of groups or items displayed" […] the dashboard parity test captures the query log and asserts the row count per query.
>
> — `sad.md §10, QG-4, abridged`

> The dashboard parity test runs the AC-05 fixture (float-drift totals, several currencies, a renamed Customer, a top-three tie, a DST switch in range) through the old and the new implementation during development. Before release, the old output is recorded as fixed expected values and the old code is deleted.
>
> — `sad.md §10, QG-2 How verify, abridged`

**Fallback:** if a slice is insufficient or the code contradicts it, read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only columns and the indexes that serve them:

| Column / index | Type | Use here | Change |
|---|---|---|---|
| `SenderProfile.userId` | text FK | owner join `sp."userId" = ${actor.userId}` | read-only |
| `Invoice.senderProfileId`, `status`, `currency`, `issueDate`, `dueDate`, `total` | text / enum / enum / timestamp / timestamp / decimal | filters, buckets, `SUM` | read-only |
| `BankAccount.senderProfileId` | text FK | currency tabs (today's tabs derive from bank accounts) | read-only |
| `SenderProfile_userId_idx`, `Invoice_senderProfileId_idx`, `Invoice_status_idx`, `Invoice_issueDate_idx`, `Invoice_dueDate_idx` | existing | owner join + filters | read-only |
| — `Invoice(senderProfileId, status, currency, issueDate)` | composite | **deferred**: only above roughly 100,000 invoices per Freelancer | none |

— `data-model.md §ER diagram + §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `getCurrencyTabs(actor)` → `CurrencyTab[]` · rows ≤ currencies.
- `getSummaryStats(actor, currency, period?)` → `DashboardSummaryStats` · rows 1.
- `getChartData(actor, currency, period?)` ✎ → `ChartDataPoint[]` · rows ≤ buckets shown. There is no `timeZone` argument, because the zone comes from `actor`.
- `type DashboardPeriod = { from: LocalDate; to: LocalDate }` (inclusive local dates, read in `actor.timeZone`).
- Errors: `VALIDATION` (`fieldErrors.period` / `fieldErrors.currency`), `FAILED` (reported once, via `failed()`).

— `contracts/public-api.md §2.7, getCurrencyTabs / getSummaryStats / getChartData, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-05 — happy

> **Given** one fixed set of invoices whose totals add up with floating-point drift (for example 0.10 + 0.20), several currencies, a Customer renamed between two invoices, Debtors tied at the top-three cut-off and a Freelancer in a time zone that switches to or from daylight saving time within the selected range
> **When** the dashboard figures are produced by the old and by the new implementation
> **Then** every amount is equal after rounding to the cent, and every count, the membership of every group and every listed invoice is identical; the names shown, the order among tied entries, which tied Debtor makes the top three, and the sender-accounts order are not compared here, because they change on purpose (§1 deliberate changes 1 and 3) and are checked by AC-06
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy

> **Given** an Assistant acting for Freelancer A, with no browser session
> **When** it asks for A's customers, products, custom prices, sender profiles, bank accounts, invoices or dashboard figures
> **Then** it receives exactly the records and figures A sees on the matching page
>
> — `spec.md §5, AC-07, verbatim`

### AC-21 — cross-context

> **Given** Freelancer A works in Europe/Kyiv and has an invoice issued at 00:30 local time on 1 October, which is still 30 September in UTC
> **When** A filters invoices or views the dashboard for September in the browser, or an Assistant asks the same while passing Europe/Kyiv
> **Then** the invoice does not count in September in either case (it belongs to A's October), and both return identical figures
>
> — `spec.md §5, AC-21, verbatim`

### AC-22 — happy

> **Given** an Assistant acting for Freelancer A passes no time zone or an unknown one
> **When** it asks for date-based figures or a date filter
> **Then** the system uses UTC days and months, exactly as the browser does today when it reports no valid time zone
>
> — `spec.md §5, AC-22, verbatim`

## Checklist

- [ ] RED: write `tests/integration/services/dashboard/parity.test.ts` with the AC-05 fixture (built from `tests/support/factories/`): float-drift totals, ≥2 currencies, a renamed Customer, a top-three Debtor tie, and a DST switch inside the range in `Europe/Kyiv`. It calls the **old** actions (`lib/actions/dashboard-actions.ts`, with the session mocked as today) and the new functions with `actingFreelancerForTest(...)`, and compares the amounts rounded to the cent plus the counts. Build it as a reusable harness so T18 can add sections to it.
- [ ] RED: `tests/integration/services/dashboard/summary-chart.test.ts`: two-Freelancer isolation per query, the AC-21 Kyiv 00:30 1 October invoice outside September, AC-22 UTC fallback, `VALIDATION` for a reversed or malformed period and an unknown currency, and a row-count assertion from the Prisma query log.
- [ ] `lib/services/dashboard/period.ts` (or inside `dashboard.ts`): zod schema for `DashboardPeriod` + `currency`, and conversion to `[startOfLocalDay(from), startOfLocalDay(to + 1))` with the T3 helpers in `actor.timeZone`.
- [ ] `lib/services/dashboard/queries.ts`: one `$queryRaw` tagged template each for currency tabs, summary stats and the chart. Each is joined through `"SenderProfile"` with `sp."userId" = ${actor.userId}`, uses `SUM(numeric)`, and buckets the chart with `AT TIME ZONE ${actor.timeZone}`. Each has a zod row schema (`bigint` → number, numeric → number once).
- [ ] `lib/services/dashboard/dashboard.ts`: `getCurrencyTabs`, `getSummaryStats`, `getChartData` return `ActionResult<DTO>`, each inside the Sentry span `dashboard.<section>`, and `failed()` on an unexpected error. Import `'server-only'`.
- [ ] Do not touch `lib/actions/dashboard-actions.ts` (T19 switches the wrappers).

## Edge cases

| Case | Behaviour |
|---|---|
| `period` omitted | all time, same as today's `appliedRange === undefined` |
| period `from > to`, one end missing, or not a real `YYYY-MM-DD` | `VALIDATION`, `fieldErrors.period` "Give both dates as YYYY-MM-DD, with the start on or before the end.", no query runs |
| currency outside `Currency` | `VALIDATION`, `fieldErrors.currency` "Unknown currency." |
| actor zone unknown to Intl or PostgreSQL | the factory already resolved it to UTC, and buckets are UTC (AC-22) |
| DST switch inside the range | local-day buckets come from `AT TIME ZONE` with the same zone as the JS bounds, and parity holds |
| Freelancer B's invoices in the same currency | never counted for A (two-Freelancer test) |
| database error | `FAILED`, plain-language message, reported to Sentry once |
| Freelancer with no invoices | today's empty DTOs (zero stats, empty chart) |

## Definition of Done

- [ ] The parity test passes: amounts equal to the cent, counts and group membership identical, old vs new, on the AC-05 fixture.
- [ ] The row count per query is ≤ groups or items displayed (query-log assertion).
- [ ] The two-Freelancer, AC-21 and AC-22 tests pass, and `VALIDATION` cases return no data.
- [ ] Each section runs in its `dashboard.<section>` span. No `next/*` or `@/auth` import in `lib/services/dashboard/` (T1 lint passes).
- [ ] Every Hard Rule inlined above still holds.
- [ ] lint + `tsc --noEmit` clean.
