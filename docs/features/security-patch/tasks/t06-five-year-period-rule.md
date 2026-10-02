---
id: T6
title: "Add the shared five-year Dashboard period rule and apply it in the link reader and the business layer"
layer: "domain"
deps: ["T1"]
blocks: ["T7"]
acs: ["AC-07", "AC-08", "AC-09", "AC-10"]
files_hint: ["lib/validations/dashboard-period.ts", "lib/validations/search-params.ts", "lib/services/dashboard/period.ts", "tests/unit/lib/validations/", "tests/integration/services/dashboard/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T6 — Add the shared five-year Dashboard period rule and apply it in the link reader and the business layer

## Place in the sequence

- **Blocked by:** T1 — Upgrade Next.js to 16.3.x, next-auth to 5.0.0-beta.32 and nodemailer to 10.x in one change · **Blocks:** T7 — Show the five-year notice in the dashboard filter and refuse to apply an over-long range · **Wave:** 2 — a pure rule with no DB or auth dependency, built on the upgraded stack.
- **Lane:** shares the test dir `tests/unit/lib/validations/` with T11 and T16 (test files only, distinct names). Otherwise its own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the dashboard to accept custom Dashboard periods of up to 5 years, refuse longer ones in the filters with an explanation, and fall back safely when a link carries one
> **So that** the dashboard stays fast and nobody can stall the app by sending me a crafted link
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As an** Assistant acting for a Freelancer
> **I want** a request for dashboard figures over a period longer than 5 years to be refused with a plain reason
> **So that** I can ask again for a shorter period instead of waiting on a request that never finishes
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task defines the boundary once and applies it at the two server-side readers: the link falls back, the business layer refuses (the filter is T7).

## Inlined context

> **Chosen:** Option 1. A pure `isWithinMaxCustomPeriod(from, to)` and `MAX_CUSTOM_PERIOD_YEARS = 5` live in a dependency-free module under `lib/validations/`, with no `server-only` and no Node or Next imports. The link reader, the filter component and `period.ts` all import it. […] The boundary is defined once and tested once with a table: 2021-01-01 → 2026-01-01 applied, → 2026-01-02 refused, 29 February starts, and time-zone independence.
> **Negative:** The module must stay free of server or browser dependencies, enforced by a lint rule or a unit test. **Neutral:** "All time" stays a preset and is never passed through the custom-period rule (AC-09).
>
> — `adr/0004-share-one-calendar-date-five-year-period-rule-across-link-filter-and-business-layer.md, Decision outcome + Consequences, abridged` · full text: [ADR-0004](../adr/0004-share-one-calendar-date-five-year-period-rule-across-link-filter-and-business-layer.md)

> `getChartData` walks every day of the period, so `from=0100-01-01&to=9999-12-31` builds about 3.6 million day keys (brief S3).
>
> — `adr/0004, Context, abridged` · full text: [ADR-0004](../adr/0004-share-one-calendar-date-five-year-period-rule-across-link-filter-and-business-layer.md)

> S->>S: link reader applies the shared five-year rule on calendar dates, independent of time zone · alt no period, a preset, or a malformed value → use that preset, the current month by default · else the all time preset → use the full history, the cap does not apply · else custom period whose end date is at most its start plus 5 calendar years → use the custom period (a 29 February start counts to 28 February) · else custom period longer than 5 years → fall back to the current month, no error
>
> — `sad.md §6, Flow 3, abridged` · full text: [sad.md](../sad.md)

> C->>S: ask for dashboard figures for a period · S->>S: apply the shared five-year rule before any query · alt custom period longer than 5 years → validation error in plain language, the period must be at most 5 years, nothing computed
>
> — `sad.md §6, Flow 5, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Dashboard load, any link including an over-long period, p95 ≤ 2 s.
>
> — `spec.md §6, NFR row 1, abridged` · full text: [spec.md](../spec.md)

> **Hard rule:** Business functions live in `lib/services/` behind `server-only` and lint bans (service-layer ADR-0006).
>
> — `sad.md §2, Conventions, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

```ts
export const MAX_CUSTOM_PERIOD_YEARS = 5;
export const PERIOD_TOO_LONG =
  'A custom period can be at most 5 years. Choose "All time" to see your full history.';
```

- `getSummaryStats` / `getChartData` / `getSenderAccounts(actor, currency, period?)` — over-long custom period → `fail('VALIDATION', 'Please fix the highlighted fields.', { fieldErrors: { period: [PERIOD_TOO_LONG] } })`, before any query. `period` omitted = all time, never capped.
- Link `/dashboard?from=&to=&preset=` (`dashboardParamsSchema`): valid `from ≤ to` longer than 5 years → current local month, the same as a malformed link; no error, no notice. `preset=all-time` → full history (unchanged).
- Server actions `getDashboardSummaryStats`, `getDashboardChartData`, `getDashboardSenderAccounts` pass the refusal through unchanged.

— `contracts/server-actions.md, §Dashboard + §Link parameters, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-07 — domain invariant

> **Given** a Freelancer opens a dashboard link whose custom Dashboard period is longer than 5 years
> **When** the dashboard loads
> **Then** it shows the default period (the current month), the same as for any malformed link, within normal dashboard load time, because a custom Dashboard period can never exceed 5 years
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a Freelancer in any time zone opens a dashboard link with a custom Dashboard period of exactly 5 years, or one of 5 years and one day
> **When** the dashboard loads each of them
> **Then** the 5-year period is applied, the longer one falls back to the default period, and the link reading and the business rule agree on the same boundary. The boundary is calendar dates, independent of time zone: a custom period is allowed when its end date (inclusive) is no later than its start date plus 5 calendar years, and a 29 February start counts to 28 February. Example: 2021-01-01 to 2026-01-01 is applied; 2021-01-01 to 2026-01-02 falls back
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — happy path

> **Given** a Freelancer whose invoices span more than 5 years
> **When** they choose the "all time" preset
> **Then** the dashboard shows their full history, because the preset is not a custom period and the cap does not apply
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — error

> **Given** any caller of the business layer acting for a Freelancer, such as the future Assistant (verified today by calling the business layer directly)
> **When** it asks for dashboard figures over a period longer than 5 years
> **Then** the system refuses before computing anything and tells it in plain language that the period must be at most 5 years. A browser dashboard request carrying such a period gets the AC-07 fallback instead
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write the table test first: `tests/unit/lib/validations/dashboard-period.test.ts` (2021-01-01→2026-01-01 true, →2026-01-02 false, 2020-02-29→2025-02-28 true, →2025-03-01 false, inverted/malformed false, run under two `TZ` values).
- [ ] Create `lib/validations/dashboard-period.ts`: `MAX_CUSTOM_PERIOD_YEARS`, `PERIOD_TOO_LONG`, `addCalendarYears(date, n)` on `YYYY-MM-DD` strings (29 Feb → 28 Feb), `isWithinMaxCustomPeriod(from, to)`. Pure string/`Date.UTC` arithmetic only; no imports beyond none.
- [ ] Add a unit test (or ESLint rule) asserting the module imports nothing (no `server-only`, `next/*`, `node:*`, `react`).
- [ ] `lib/validations/search-params.ts` `dashboardParamsSchema`: an over-long valid custom range falls through to the current-month default, exactly like a malformed one; `preset=all-time` untouched.
- [ ] `lib/services/dashboard/period.ts` `parseDashboardInput`: after the existing `from ≤ to` check, refuse an over-long period with `fieldErrors.period = [PERIOD_TOO_LONG]`, before any query.
- [ ] Integration tests in `tests/integration/services/dashboard/`: business functions refuse >5 y without touching the DB (no query spy hits), accept exactly 5 y, `period` omitted spans >5 y of invoices (AC-09).
- [ ] Unit test for the link reader: the AC-08 pair gives applied vs current month; malformed and over-long give the same result.

## Edge cases

| Case | Behaviour |
|---|---|
| `from=0100-01-01&to=9999-12-31` in a link | current month, no heavy computation (AC-07) |
| same range to the business layer | `VALIDATION` with `PERIOD_TOO_LONG`, nothing computed (AC-10) |
| start 29 Feb, end 28 Feb +5 y | applied; end 1 Mar +5 y → refused/fallback |
| Freelancer in UTC−12 vs UTC+14 | same verdict — calendar dates only |
| `preset=all-time` with 10 y of invoices | full history, cap not applied (AC-09) |
| inverted range (`from > to`) | unchanged behaviour: link → current month; service → `PERIOD_MESSAGE` |

## Definition of Done

- [ ] the boundary table test passes, including 29 February and two time zones
- [ ] the dependency-free test (or lint rule) for `dashboard-period.ts` passes
- [ ] link reader and `parseDashboardInput` give the same verdict for the AC-08 pair (one shared test fixture)
- [ ] business-layer refusal happens before any Prisma query (AC-10)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
