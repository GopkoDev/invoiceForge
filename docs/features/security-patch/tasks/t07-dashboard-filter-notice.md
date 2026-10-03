---
id: T7
title: "Show the five-year notice in the dashboard filter and refuse to apply an over-long range"
layer: "ui"
deps: ["T6"]
blocks: ["T20"]
acs: ["AC-07b", "AC-08"]
files_hint: ["components/dashboard/header/dashboard-filters.tsx", "tests/component/dashboard-filters.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "done"
---

# T7 — Show the five-year notice in the dashboard filter and refuse to apply an over-long range

## Place in the sequence

- **Blocked by:** T6 — Add the shared five-year Dashboard period rule and apply it in the link reader and the business layer · **Blocks:** T20 — Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit · **Wave:** 3 — needs the shared rule module and `PERIOD_TOO_LONG` from T6.
- **Lane:** own lane (no other task touches `dashboard-filters.tsx`).

## Why (user story)

> **As a** Freelancer
> **I want** the dashboard to accept custom Dashboard periods of up to 5 years, refuse longer ones in the filters with an explanation, and fall back safely when a link carries one
> **So that** the dashboard stays fast and nobody can stall the app by sending me a crafted link
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task delivers the "refuse longer ones in the filters with an explanation" part, using the same rule as the link reader so both agree on the boundary.

## Inlined context

> | validation: period too long | In the filter `Calendar`, the Freelancer picks a range whose end is past start + 5 calendar years. **D-S2:** the range is not applied and there is no navigation. The `Popover` stays open with the selection visible, and an inline `Alert` under the calendar shows `PERIOD_TOO_LONG`. The notice clears on the next pick: a preset, or a range within the cap (AC-07b; flow US-03 F0 → F1; sad.md §6 flow 4 `else`) | `Popover`, `Calendar`, `Alert` |
> | default | Verified session, period from the link: a preset (default this month), "All time" with the full history and no cap (AC-09), or a custom period within 5 calendar years. The filter label shows the applied range | `DashboardFilters`, existing dashboard sections |
>
> — `screens.md §SCR-04, states validation: period too long + default, abridged` · full text: [screens.md](../screens.md)

Wireframe (dashboard below keeps showing the previously applied period):

```text
|   | All Time  | (!) A custom period can be at most 5     | |
|   |           |     years. Choose "All time" to see your | |
|   |           |     full history.                        | |
```

— `screens.md §SCR-04, wireframe, abridged` · full text: [screens.md](../screens.md)

> UI->>UI: applies the shared five-year rule in the browser · alt range of at most 5 years → request the dashboard for the custom period (the server applies the same rule again, as in flow 3) · else range longer than 5 years → filter not applied, notice that a custom period is at most 5 years and all time shows the full history · Postcondition: the filter never sends an over-long range. Nothing persisted
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** The new messages reuse the existing shadcn/ui primitives and tokens from `docs/design-system.md`. No new primitive and no new client state library.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** the rule module `lib/validations/dashboard-period.ts` is dependency-free, so the client imports it directly; never import from `lib/services` (server-only) in this component.
>
> — `adr/0004, Decision outcome, abridged` · full text: [ADR-0004](../adr/0004-share-one-calendar-date-five-year-period-rule-across-link-filter-and-business-layer.md)

Reused components: `DashboardFilters` (`components/dashboard/header/dashboard-filters.tsx`, already uses `Popover` + `Calendar` with `handleCalendarSelect`), `Alert` (`components/ui/alert.tsx`). No new component.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

> The filter applies `isWithinMaxCustomPeriod` before navigating. An over-long range is not applied, and the filter shows `PERIOD_TOO_LONG`. The rule module is dependency-free, so it can be imported by the client.
>
> `PERIOD_TOO_LONG = 'A custom period can be at most 5 years. Choose "All time" to see your full history.'`

— `contracts/server-actions.md, §Dashboard filter + constants, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-07b — error

> **Given** a Freelancer choosing a custom Dashboard period in the dashboard filters
> **When** they pick a range longer than 5 years
> **Then** the filter does not apply it and tells them that a custom period can be at most 5 years and that "all time" shows their full history
>
> — `spec.md §5, AC-07b, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — domain invariant

> **Given** a Freelancer in any time zone opens a dashboard link with a custom Dashboard period of exactly 5 years, or one of 5 years and one day
> **When** the dashboard loads each of them
> **Then** the 5-year period is applied, the longer one falls back to the default period, and the link reading and the business rule agree on the same boundary. The boundary is calendar dates, independent of time zone: a custom period is allowed when its end date (inclusive) is no later than its start date plus 5 calendar years, and a 29 February start counts to 28 February. Example: 2021-01-01 to 2026-01-01 is applied; 2021-01-01 to 2026-01-02 falls back
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Extend `tests/component/dashboard-filters.test.tsx` first: picking 2021-01-01→2026-01-02 shows the `PERIOD_TOO_LONG` alert and does not navigate; picking 2021-01-01→2026-01-01 navigates; a preset pick after the alert clears it.
- [ ] `components/dashboard/header/dashboard-filters.tsx`: in `handleCalendarSelect`, convert the picked dates to local `YYYY-MM-DD` and call `isWithinMaxCustomPeriod` from `lib/validations/dashboard-period.ts`; on false keep the `Popover` open, keep the selection, set a `periodTooLong` flag and skip navigation.
- [ ] Render `Alert` (variant matching existing error alerts) under the `Calendar` with `PERIOD_TOO_LONG` text (imported constant, not a copy) when the flag is set; clear it on any preset pick or within-cap range.
- [ ] Check the alert renders at phone width inside `PopoverContent` (responsive-both posture).

## Edge cases

| Case | Behaviour |
|---|---|
| range exactly 5 calendar years | applied, navigates, no alert |
| 5 years + 1 day | not applied, alert shown, Popover stays open, dashboard keeps previous period |
| start 29 Feb 2020, end 28 Feb 2025 | applied |
| only a start date picked so far | no verdict yet, no alert |
| alert visible, then "All Time" preset | alert clears, all time applied (no cap) |

## Definition of Done

- [ ] component test for AC-07b passes (no navigation, alert text equals `PERIOD_TOO_LONG`)
- [ ] component test shows the exact-5-year range is applied (AC-08 boundary agrees with T6's link reader)
- [ ] no new UI primitive added; only `Alert` reused
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
