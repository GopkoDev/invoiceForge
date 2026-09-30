---
id: T22
title: "Carry the browser time zone in a validated tz cookie with day-bound helpers"
layer: "infra"
deps: ["T00", "T09"]
blocks: ["T23", "T24"]
acs: ["AC-27"]
files_hint: ["lib/helpers/time-zone.ts", "components/time-zone-cookie.tsx", "app/(protected)/layout.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T22 — Carry the browser time zone in a validated tz cookie with day-bound helpers

## Place in the sequence

- **Blocked by:** T09 — Treat sessions without a live account as Visitors in layouts and guards · **Blocks:** T23 — Parse invoice-list link parameters with fallback defaults and inclusive local date ranges, T24 — Parse dashboard date ranges with a current-month fallback and key Suspense on currency · **Wave:** wave 3 — input and link validation (spec §1).
- **Lane:** shares files with T08 (`components/time-zone-cookie.tsx`), T09 (`app/(protected)/layout.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** invoice-list and dashboard links with bad or tampered parameters to open with sensible defaults, and date ranges to include the end date
> **So that** a shared or bookmarked link never crashes the page or shows wrong figures
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task gives the server "the Freelancer's time zone (the one their browser reports)", so day boundaries and the current month are the Freelancer's own.

## Inlined context

> It implements the spec's wording directly for both AC-25 and AC-27, needs no schema or UI, keeps links free of per-viewer state (a shared link shows each viewer their own days), and is contained in `lib/helpers/time-zone.ts`. An invalid or missing cookie falls back to UTC and never throws.
>
> — `adr/0010, Decision outcome, abridged` · full text: [ADR-0010](../adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md)

> **Hard rule:** | Time and time zones | Stored as UTC. Day boundaries and "current month" use the validated browser time zone from the `tz` cookie, falling back to UTC. Range ends are exclusive at the next local midnight |
>
> — `sad.md §8, row Time and time zones, verbatim` · full text: [sad.md](../sad.md)

> The first-ever server render uses UTC until the `tz` cookie exists (ADR-0010).
>
> — `sad.md §11, Accepted debt, verbatim` · full text: [sad.md](../sad.md)

> `(protected)/layout.tsx                 ✎ requireLiveUser() (ADR-0002); tz-cookie client island (ADR-0010)`
>
> — `sad.md §5, internal decomposition, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-27 — happy

> **Given** invoices issued at any time on the last day of a filtered date range, where days are counted in the Freelancer's time zone (the one their browser reports)
> **When** the Freelancer filters the invoice list by that range
> **Then** those invoices are included
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Client island: on mount, if `document.cookie` `tz` ≠ `Intl.DateTimeFormat().resolvedOptions().timeZone`, set `tz=<name>; path=/; max-age=31536000; SameSite=Lax` and `router.refresh()` once — `components/time-zone-cookie.tsx`
- [ ] Render the island in the protected layout (after `requireLiveUser()` from T09) — `app/(protected)/layout.tsx`
- [ ] `getRequestTimeZone()` (reads `cookies()`, validates with `Intl.DateTimeFormat(undefined, { timeZone })` in try/catch, falls back to `UTC`), `startOfLocalDay(date, tz)`, `localDayRange(from, to, tz)` → `[start, nextMidnightAfter(to))`, `currentLocalMonth(tz)` — `lib/helpers/time-zone.ts` (no new dependency; use `Intl` offsets)
- [ ] Scratch-check DST edges: `Europe/Kyiv` 2026-10-25, `America/New_York` 2026-11-01

## Edge cases

| Case | Behaviour |
|---|---|
| Cookie missing (first render) | UTC; after the island sets it, the next render uses the browser zone |
| Cookie tampered (`tz=Mars/Base`) | Invalid → UTC, never throws |
| DST change inside the range | Bounds computed per local midnight; the day still has 23/25 hours |

## Definition of Done

- [ ] scratch run: `localDayRange('2026-09-01','2026-09-30','Europe/Kyiv')` ends at `2026-09-30T21:00:00Z` (exclusive) and DST-edge days are 23/25 h
- [ ] the `tz` cookie is set after the first protected page load and an invalid value falls back to UTC
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
