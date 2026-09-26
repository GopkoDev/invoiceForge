---
id: T24
title: "Parse dashboard date ranges with a current-month fallback and key Suspense on currency"
layer: "ports"
deps: ["T00", "T22", "T23"]
blocks: []
acs: ["AC-25"]
files_hint: ["lib/validations/search-params.ts", "app/(protected)/dashboard/page.tsx", "lib/actions/dashboard-actions.ts", "components/dashboard/header/dashboard-filters.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T24 — Parse dashboard date ranges with a current-month fallback and key Suspense on currency

## Place in the sequence

- **Blocked by:** T22 — Carry the browser time zone in a validated tz cookie with day-bound helpers, T23 — Parse invoice-list link parameters with fallback defaults and inclusive local date ranges · **Blocks:** — · **Wave:** wave 3 — input and link validation (spec §1).
- **Lane:** shares files with T08 (`lib/actions/dashboard-actions.ts`), T23 (`lib/validations/search-params.ts`), T26 (`app/(protected)/dashboard/page.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** invoice-list and dashboard links with bad or tampered parameters to open with sensible defaults, and date ranges to include the end date
> **So that** a shared or bookmarked link never crashes the page or shows wrong figures
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task makes a malformed dashboard link show the current month in the Freelancer's time zone with the filter showing the range actually applied.

## Inlined context

> | Param | Accepted | Default |
> |---|---|---|
> | `from`, `to` | `YYYY-MM-DD`, both valid and from ≤ to | the current month in `tz` (AC-25) |
> | `preset` | `all-time` (no range) or absent | absent |
> | `currency` | enum `Currency`, among the Freelancer's currency tabs | the first currency tab (existing `validateCurrency`) |
>
> The page returns `appliedRange` to the date filter (AC-25).
>
> — `contracts/server-actions.md §Link parameters, Dashboard, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Hard rule:** | Cache invalidation | Mutations call `revalidatePath(protectedRoutes.<x>)`. **Dashboard Suspense boundaries for debtors, expected payments and recent invoices are keyed on currency only** (A9) |
>
> — `sad.md §8, row Cache invalidation, verbatim` · full text: [sad.md](../sad.md)

> | Dashboard date-range change | reloads only date-dependent sections (3 fewer data loads per change) | request count per change in a production trace |
>
> — `spec.md §6, NFR row «Dashboard date-range change», verbatim` · full text: [spec.md](../spec.md)

> | default (range fallback) | The link range is malformed, or its start is after its end. The page shows the current month in the browser's time zone, the filter shows that month, and no notice appears (AC-25) | as default | wireframe below |
>
> — `screens.md §SCR-06 Dashboard, range fallback row, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** | Time and time zones | Stored as UTC. Day boundaries and "current month" use the validated browser time zone from the `tz` cookie, falling back to UTC. Range ends are exclusive at the next local midnight |
>
> — `sad.md §8, row Time and time zones, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Dashboard page params `from`, `to`, `preset`, `currency` → `appliedRange` passed to the date filter.

— `contracts/server-actions.md §Link parameters, Dashboard, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-25 — error

> **Given** a dashboard link whose date range is malformed, including a range whose start is after its end
> **When** the Freelancer opens it
> **Then** the dashboard shows the current month in the Freelancer's time zone (the one their browser reports), and the date filter displays the range that was actually applied
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `dashboardParamsSchema` (`.catch` fallbacks; invalid or inverted range → `currentLocalMonth(tz)`) — `lib/validations/search-params.ts`
- [ ] Page: parse params, compute `appliedRange` with `getRequestTimeZone()`, pass it to the filter and to date-dependent sections; key the debtors / expected payments / recent invoices `Suspense` on `currency` only — `app/(protected)/dashboard/page.tsx`
- [ ] Date-dependent dashboard actions take `{ start, endExclusive }` from the helper instead of building dates from raw strings — `lib/actions/dashboard-actions.ts`
- [ ] Filter shows `appliedRange` — `components/dashboard/header/dashboard-filters.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| `?from=abc&to=xyz` | Current month in the browser zone; filter shows it; no notice |
| `?from=2026-10-05&to=2026-10-01` | Current month (AC-25) |
| `?preset=all-time` | No range; unchanged behaviour |
| Date range changed | Only date-dependent sections re-suspend (3 fewer loads) |

## Definition of Done

- [ ] malformed and inverted dashboard links show the current local month and the filter displays it (AC-25)
- [ ] changing the date range in `pnpm dev` does not re-request debtors, expected payments or recent invoices (Network/server log)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
