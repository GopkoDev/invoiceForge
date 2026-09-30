---
id: T19
title: "Switch the dashboard wrappers to the layer, pass local-date periods, record parity values and delete the in-memory code"
layer: "ports"
deps: ["T18"]           # task ids that must finish first
blocks: ["T20"]         # task ids waiting on this one — the inverse of `deps` (markdown only)
acs: ["AC-01", "AC-05", "AC-06"]
files_hint: ["lib/actions/dashboard-actions.ts", "lib/validations/search-params.ts", "app/(protected)/dashboard/", "tests/integration/services/dashboard/", "tests/unit/lib/validations/dashboard-params.test.ts", "tests/integration/actions/dashboard-chart-data-tz.test.ts", "tests/unit/lib/actions/failed-reports-once.test.ts"]
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

# T19 — Switch the dashboard wrappers to the layer, pass local-date periods, record parity values and delete the in-memory code

## Place in the sequence

- **Blocked by:** T18 — Build the dashboard SQL for sender accounts, recent invoices, Debtors and Expected payments · **Blocks:** T20 — Close the move: zero data-store calls in lib/actions, inventory checks · **Wave:** 6 (DAG level). This is the cut-over step of release wave 4 (sad.md §7): record the old outputs, switch the wrappers, delete the old code.
- **Lane:** shares `lib/actions/dashboard-actions.ts` with T5 (the spans added there move into the layer; T5 is already done). Own lane otherwise.

## Why (user story)

> **As a** Freelancer
> **I want** every page, form, picker and the dashboard to behave exactly as before
> **So that** the internal change costs me nothing and I don't have to relearn anything
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my dashboard figures (revenue, the chart, sender accounts, Debtors and Expected payments) to match today's to the cent and to appear in a stable order
> **So that** I can rely on them as my invoice history grows
>
> — `spec.md §4, US-02, verbatim`

This task puts the browser dashboard on the new SQL business functions without any visible change except the deliberate naming and order, and removes the old in-memory code.

## Inlined context

> | 4 | dashboard sections on SQL (ADR-0004) | parity test run old-vs-new, then its old outputs recorded as fixed expected values, then the old in-memory code deleted (spec §1 change 5) | code only; until the old code is deleted, the previous build is a complete fallback |
>
> — `sad.md §7, wave table row 4, verbatim` · full text: [sad.md](../sad.md)

> 5. At release, the old in-memory dashboard code, the unused list-all-invoices function (with its test) and every other function the move leaves unused are deleted.
>
> — `spec.md §1, Deliberate behaviour change 5, verbatim`

> - **`period` omitted = all time** (today's `appliedRange === undefined`). The page wrapper still computes its current-month fallback, but as local dates: `dashboardParamsSchema` returns `{ from, to }` instead of `Date` bounds.
>
> | `getCurrencyTabs(actor)` | […] | `getDashboardCurrencyTabs()`, inside `unstable_cache` 60 s (wrapper only) |
> | `getChartData(actor, currency, period?)` ✎ | […] | `getDashboardChartData(currency, period?)` ✎. The explicit `timeZone` argument is dropped, because the zone comes from `actor` |
>
> — `contracts/public-api.md §2.7, DashboardPeriod notes + table rows 1 and 3, abridged` · full text: [public-api.md](../contracts/public-api.md)

> 1. `actingFreelancerFromSession()` first. On `UNAUTHORIZED`, return it (actions) or redirect to sign-in (pages), and never call a business function.
> 2. Call the business function, then return its result **untouched**. […]
> 4. Never report to Sentry. The business function already has.
>
> — `contracts/public-api.md §3, obligations 1, 2, 4, abridged`

> | Cache invalidation | **Only web adapters call `revalidatePath` and `unstable_cache`**, after a successful result, with the same paths and tags as today (AC-03). The business layer never touches page caches | ADR-0006 |
>
> — `sad.md §8, Cache invalidation row, verbatim`

> **Hard rule:** 0 changed or removed expected values in existing automated tests (sole exception: the test of the removed list-all-invoices function)
>
> — `spec.md §6, Behaviour parity row, abridged`

> **Hard rule:** Dashboard parity | 0 differences above 0.01 per amount; 0 differences in counts, group membership or listed invoices (Debtor / sender-account names and tie order excluded; checked by AC-06) | old-vs-new comparison on the AC-05 fixture during development; before release the old output is recorded as fixed expected values in that test and the old code is deleted (§1 change 5)
>
> — `spec.md §6, Dashboard parity row, verbatim`

**Parity caution (repo fact, 2026-10-01):** two existing tests touch the shapes this task changes.
- `tests/unit/lib/validations/dashboard-params.test.ts` asserts `appliedRange.start/endExclusive`. Keep `appliedRange` in the schema output and **add** `period: { from, to } | undefined` next to it, so no expected value changes.
- `tests/integration/actions/dashboard-chart-data-tz.test.ts` calls `getDashboardChartData('USD', appliedRange, 'America/New_York')`. Its call arguments must change to `(currency, period)` with the zone set through the session or `tz` cookie mock. If that would change any **expected value**, stop and escalate rather than edit it.

**Fallback:** if a slice is insufficient or the code contradicts it, read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) ·
[api-sync-report.md](../contracts/api-sync-report.md) D3 · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Web wrappers keep their export names: `getDashboardCurrencyTabs()`, `getDashboardSummaryStats(currency, period?)` ✎, `getDashboardChartData(currency, period?)` ✎, `getDashboardSenderAccounts(currency, period?)` ✎, `getDashboardRecentInvoices(currency)`, `getDashboardDebtors(currency)`, `getDashboardExpectedPayments(currency)`.
- Each one: `actingFreelancerFromSession()` → the `lib/services/dashboard` function → the result, untouched. `UNAUTHORIZED` comes only from the factory.
- `type DashboardPeriod = { from: LocalDate; to: LocalDate }`.

— `contracts/public-api.md §2.7 + §3, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-01 — happy

> **Given** a signed-in Freelancer with existing sender profiles, customers, products, custom prices, bank accounts and invoices
> **When** the Freelancer opens any list, detail page, the invoice editor, a picker or the dashboard, or saves any form
> **Then** they see the same records, values, order, messages and confirmations as before the change (except the deliberate dashboard naming and tie order in AC-06), and every existing automated check passes with its expected values unchanged (the only removed check is the one for the unused list-all-invoices function)
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — happy

> **Given** one fixed set of invoices whose totals add up with floating-point drift (for example 0.10 + 0.20), several currencies, a Customer renamed between two invoices, Debtors tied at the top-three cut-off and a Freelancer in a time zone that switches to or from daylight saving time within the selected range
> **When** the dashboard figures are produced by the old and by the new implementation
> **Then** every amount is equal after rounding to the cent, and every count, the membership of every group and every listed invoice is identical; the names shown, the order among tied entries, which tied Debtor makes the top three, and the sender-accounts order are not compared here, because they change on purpose (§1 deliberate changes 1 and 3) and are checked by AC-06
>
> — `spec.md §5, AC-05, verbatim`

### AC-06 — domain invariant

> **Given** a Customer renamed between two of their overdue invoices, and two Debtors who owe the same overdue total at the top-three cut-off
> **When** the Freelancer opens the Debtors section
> **Then** each Customer appears at most once, under the name on their most recent overdue invoice (latest issue date, then latest created). Debtors tied on their exact overdue total are ordered by name, which also decides who makes the top three. Sender profiles and their accounts appear in the fixed order of §1 deliberate change 3, so the same data always gives the same dashboard
>
> — `spec.md §5, AC-06, verbatim`

## Checklist

- [ ] RED: in `tests/integration/services/dashboard/parity.test.ts`, capture the old actions' outputs on the AC-05 fixture and write them in as **fixed expected values**. Make the test compare only the new functions against them, and confirm it is green before any deletion.
- [ ] RED: extend `tests/unit/lib/validations/dashboard-params.test.ts` with **new** cases for the added `period` output (current-month fallback as local dates, a valid range, `preset=all-time` → `undefined`). Leave the existing assertions untouched.
- [ ] `lib/validations/search-params.ts`: `dashboardParamsSchema` additionally returns `period: { from, to } | undefined`, using the same fallback rules.
- [ ] `lib/actions/dashboard-actions.ts`: rewrite the seven exports as thin wrappers (`actingFreelancerFromSession()` → business function). `getDashboardCurrencyTabs` keeps `unstable_cache` with today's key, tags and 60 s revalidate around `getCurrencyTabs`. Delete the in-memory bodies and helpers (`_fetchCurrencyTabs`, in-JS sums), and move the T5 spans into the layer.
- [ ] `app/(protected)/dashboard/page.tsx`, `_sections.tsx`: pass `period` instead of `appliedRange`, and drop the chart's `timeZone` argument.
- [ ] Adapt the call arguments in `tests/integration/actions/dashboard-chart-data-tz.test.ts` and `tests/unit/lib/actions/failed-reports-once.test.ts` only if their signatures require it, keeping every expected value (see Parity caution).
- [ ] Run `tests/component/dashboard-section-outcome-routing.test.tsx` and the full suite.

## Edge cases

| Case | Behaviour |
|---|---|
| no session, or the account is gone | `UNAUTHORIZED` from the factory, and no business function is called |
| malformed dashboard link | the page still corrects it to the current local month (`period`), so the layer never sees an invalid period |
| `preset=all-time` | `period` is `undefined`, which means all time |
| currency tabs requested twice within 60 s | served from `unstable_cache` in the wrapper, as today |
| business function returns `FAILED` | the wrapper passes it through with no second Sentry report, and the section shows today's error state |
| an existing test's expected value would change | stop and escalate: that is a parity break, not a test update |

## Definition of Done

- [ ] The parity test runs on recorded expected values, and the old in-memory dashboard code is gone from `lib/actions/dashboard-actions.ts`.
- [ ] The seven dashboard actions are thin wrappers, and currency tabs are still cached for 60 s in the wrapper.
- [ ] The existing dashboard tests (params, chart tz, section routing, failed-reports-once) pass with **unchanged expected values**.
- [ ] `lib/actions/dashboard-actions.ts` has no `prisma` import.
- [ ] Every Hard Rule inlined above still holds.
- [ ] lint + `tsc --noEmit` clean.
