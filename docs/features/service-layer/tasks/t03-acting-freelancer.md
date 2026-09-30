---
id: T3
title: "Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution"
layer: "domain"
deps: ["T2"]            # task ids that must finish first
blocks: ["T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T17"]   # the inverse of `deps` (markdown only)
acs: ["AC-10", "AC-21", "AC-22"]   # spec §5 acceptance criteria this task satisfies
files_hint: ["lib/services/_shared/acting-freelancer.ts", "lib/services/_shared/time-zone.ts", "lib/helpers/time-zone.ts", "lib/helpers/session-actor.ts", "tests/support/acting-freelancer.ts", "tests/integration/services/_shared/"]
owner: "Dmytro Hopko"
estimate: "M"           # S/M/L or hours — how long the work takes
context_budget: "M"     # what the task costs the executing agent to hold (markdown only).
                        # Measured, not guessed: the non-empty lines from `## Why (user story)`
                        # through `## Acceptance criteria`.
                        # S = ≤40 inlined lines, ≤1 extra file to open
                        # M = ≤120 inlined lines, 2–4 files in play
                        # L = beyond that — split the task, or keep it and say why right here:
                        #     context_budget: "L"   # justified: <one line>
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

# T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution

## Place in the sequence

- **Blocked by:** T2 — Move the result contract into the kernel (the session factory returns `ActionResult`) · **Blocks:** T6–T13 (every domain module) and T17 (dashboard SQL) · **Wave:** 3, in parallel with T4. Every business function's first parameter is this type.
- **Lane:** own lane. T4 runs beside it in `lib/services/_shared/`, but the files are disjoint.

## Why (user story)

> **As a** Freelancer
> **I want** date-based figures and filters to use my time zone, whether I ask in the browser or an Assistant asks for me
> **So that** "this month" and "today" mean my month and my day
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task establishes who is acting, and in which zone, once, through trusted factories only. The zone is resolved the same way for JS day bounds and SQL buckets.

## Inlined context

> 1. **An explicit, branded acting Freelancer on every business function** (ADR-0001). The first argument of every function is an `ActingFreelancer { userId, timeZone }`. Its type can only be produced by trusted factories: `actingFreelancerFromSession()` in the web layer, a factory the Assistant feature will add after it authenticates, and a test factory. The factory also resolves the time zone once, so no function reads a cookie or forgets the zone.
>
> — `sad.md §4, choice 1, abridged` · full text: [sad.md](../sad.md)

> - **Time-zone resolution** (closes spec §8 OQ-2 at its default). A zone is accepted only if both `Intl` and PostgreSQL (`pg_timezone_names`, looked up once per process) know it; otherwise UTC is used, as for an unknown zone (AC-22). The check lives in the `ActingFreelancer` factories, so JS day bounds and SQL `AT TIME ZONE` buckets always use the same zone (AC-21).
>
> — `sad.md §4, inline strategy notes, verbatim` · full text: [sad.md](../sad.md)

> - The time zone comes from the `tz` cookie via `getRequestTimeZone()` (`lib/helpers/time-zone.ts`, validated with `Intl`, falling back to UTC). The day-bound helpers in that file take the zone as a plain string, but the file imports `cookies` from `next/headers` at the top level (`time-zone.ts:8`), so the business layer can't import it as it is. The file is split (§5).
>
> — `sad.md §2, Technical constraints, verbatim` · full text: [sad.md](../sad.md)

> ```
> │   ├── acting-freelancer.ts                   ★ ActingFreelancer brand + the ONLY place it is constructed from raw values (ADR-0001)
> │   ├── time-zone.ts                           ★ resolveTimeZone() (accepted only if Intl AND pg_timezone_names know it, else UTC) + the pure day-bound
> │   │                                            helpers moved from lib/helpers/time-zone.ts (localDayRange, startOfLocalDay, formatLocalDateKey…)
> lib/helpers/auth-helpers.ts                    ✎ + actingFreelancerFromSession(): session + tz cookie → ActingFreelancer, or UNAUTHORIZED
> lib/helpers/time-zone.ts                       ✎ keeps only getRequestTimeZone() (reads the cookie) + re-exports the moved pure helpers
> ```
>
> — `sad.md §5, internal decomposition, abridged` · full text: [sad.md](../sad.md)

> **Hard rule (Authorization):** **Identity enters the layer only as an `ActingFreelancer`, built by a trusted factory.** Wrappers build it before parsing any input (hardening AC-23 order preserved). […] `as ActingFreelancer` is banned by lint outside the factory module
>
> — `sad.md §8, Authorization row, abridged` · full text: [sad.md](../sad.md)

> - The brand exists only at compile time: an `as ActingFreelancer` cast bypasses it. It guards against mistakes, not attackers.
>
> — `adr/0001 §Consequences, Negative, abridged` · full text: [ADR-0001](../adr/0001-pass-a-branded-acting-freelancer-to-every-business-function.md)

**Repo today:** `lib/helpers/auth-helpers.ts` begins with `'use server'` and exports `getAuthenticatedUser()` (`auth()` → `UNAUTHORIZED` "Not signed in." when `session?.user?.id` is missing). A token without a live `User` row already yields no session (`lib/helpers/session-callback.ts`). `lib/helpers/time-zone.ts` exports `getRequestTimeZone`, `startOfLocalDay`, `localDayRange`, `currentLocalMonth` and `formatLocalDateKey`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. The zone check reads the PostgreSQL system view `pg_timezone_names` (column `name`) once per process. It needs no index.

— `data-model.md §Indexes, preamble, abridged` · full text: [data-model.md](../data-model.md)

## API contract

> ```ts
> export type ActingFreelancer = {
>   readonly userId: string;          // User.id (cuid)
>   readonly timeZone: string;        // IANA zone known to BOTH Intl and pg_timezone_names, else 'UTC'
>   readonly [actingFreelancerBrand]: true;
> };
> ```
>
> | Factory | Where | Input | Output |
> |---|---|---|---|
> | `actingFreelancerFromSession()` | `lib/helpers/session-actor.ts` (web only; `server-only`, **not** `'use server'`: `auth-helpers.ts` is a `'use server'` file, so an export there would be browser-callable) | the next-auth session + the `tz` cookie | `ActionResult<ActingFreelancer>`. `UNAUTHORIZED` "Not signed in." when there is no session or the account no longer exists (AC-10). Built **before** any argument is parsed (hardening AC-23 order) |
> | `actingFreelancerForRoute()` | `lib/helpers/session-actor.ts` (route handlers only) | `requireSession()` + the `tz` cookie | `{ ok: true; actor: ActingFreelancer } \| { ok: false; response: Response }`. The `response` is today's `requireSession()` 401 body, unchanged |
> | `actingFreelancerForTest(userId, timeZone?)` | `tests/support/` | raw values | `Promise<ActingFreelancer>` |
>
> - Every factory resolves the zone with `resolveTimeZone(raw)` (`lib/services/_shared/time-zone.ts`): kept only if `Intl` **and** PostgreSQL know it (the PostgreSQL set is read once per process), otherwise `'UTC'`. A missing zone is `'UTC'` (AC-22, spec §8 OQ-2 default).
> - The object is built only inside `acting-freelancer.ts`. `as ActingFreelancer` elsewhere fails lint (sad.md §8).
>
> — `contracts/public-api.md §1.1, ActingFreelancer, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-10 (US-08) — authorization

> **Given** a Visitor with no session, or with a session whose account no longer exists
> **When** they reach any private page or trigger any private action
> **Then** they are sent to sign in as today, and no private data is read or changed
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-21 (US-07) — cross-context

> **Given** Freelancer A works in Europe/Kyiv and has an invoice issued at 00:30 local time on 1 October, which is still 30 September in UTC
> **When** A filters invoices or views the dashboard for September in the browser, or an Assistant asks the same while passing Europe/Kyiv
> **Then** the invoice does not count in September in either case (it belongs to A's October), and both return identical figures
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-22 (US-07) — happy

> **Given** an Assistant acting for Freelancer A passes no time zone or an unknown one
> **When** it asks for date-based figures or a date filter
> **Then** the system uses UTC days and months, exactly as the browser does today when it reports no valid time zone
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: `tests/integration/services/_shared/acting-freelancer.test.ts` covers four cases. `actingFreelancerForTest(id, 'Europe/Kyiv')` keeps the zone. `actingFreelancerForTest(id)` and `actingFreelancerForTest(id, 'Mars/Olympus')` give `'UTC'`. A zone that `Intl` knows but the test database's `pg_timezone_names` lacks (stub the cached set) gives `'UTC'`. The PostgreSQL set is queried once per process, which you can assert with a query counter.
- [ ] RED (unit): `startOfLocalDay` / `localDayRange` for Kyiv put 2026-10-01T00:30+03:00 in October's range, not September's (AC-21). This test is the JS half. The SQL half is proved in T13 and T17.
- [ ] `lib/services/_shared/time-zone.ts` (`import 'server-only'`): move `startOfLocalDay`, `localDayRange`, `currentLocalMonth` and `formatLocalDateKey` verbatim. Add `resolveTimeZone(raw?: string): Promise<string>`, which checks `Intl` and a memoized `SELECT name FROM pg_timezone_names` (via `prisma.$queryRaw`).
- [ ] `lib/helpers/time-zone.ts`: keep `getRequestTimeZone()` and re-export the moved helpers. Callers stay unchanged.
- [ ] `lib/services/_shared/acting-freelancer.ts`: declare the brand symbol and the `ActingFreelancer` type. Add the single internal constructor `createActingFreelancer(userId, rawZone)`, which awaits `resolveTimeZone` and performs the only allowed cast.
- [ ] `actingFreelancerFromSession()`: `getAuthenticatedUser()`, then `getRequestTimeZone()`, then `createActingFreelancer`. Pass `UNAUTHORIZED` through. It lives in the new `lib/helpers/session-actor.ts` (`import 'server-only'`, no `'use server'`), not in `auth-helpers.ts`.
- [ ] `actingFreelancerForRoute()` in the same file: `requireSession()` (`lib/helpers/route-auth.ts`), and on `ok: false` return its `response` untouched. Otherwise `getRequestTimeZone()`, then `createActingFreelancer`. T9 and T11 use it in the two route handlers.
- [ ] RED (integration): `actingFreelancerForRoute()` without a session returns today's 401 response body.
- [ ] `tests/support/acting-freelancer.ts`: `actingFreelancerForTest(userId, timeZone?)` via `createActingFreelancer`.
- [ ] Run `pnpm lint`. The cast ban from T1 must pass, since the cast lives only in `acting-freelancer.ts`.

## Edge cases

| Case | Behaviour |
|---|---|
| No session, or a token whose `User` row is gone | `UNAUTHORIZED` "Not signed in.". No business function is called (AC-10) |
| `tz` cookie missing, oversized or unknown to `Intl` | `getRequestTimeZone()` already gives `'UTC'`, and `resolveTimeZone` keeps `'UTC'` |
| Zone known to `Intl` but not to PostgreSQL, or the reverse | `'UTC'` (sad.md §11 Low-risk row) |
| `pg_timezone_names` lookup throws | report it once via `failed()`, then `FAILED`. Never silently accept an unchecked zone |
| `lib/helpers/auth-helpers.ts` starts with `'use server'` | every export there becomes a browser-callable action. Put `actingFreelancerFromSession` in a module without `'use server'` (e.g. split `auth-helpers.ts` or add `lib/helpers/acting-freelancer-from-session.ts` with `import 'server-only'`), and flag the path change in the PR |
| A caller builds `{ userId, timeZone }` as a literal | fails `tsc` (missing brand). A cast fails lint |

## Definition of Done

- [ ] The integration test proves `Intl` ∩ `pg_timezone_names`, the UTC fallback for a missing, unknown or one-sided zone, and a single PostgreSQL lookup per process.
- [ ] `actingFreelancerFromSession()` returns `UNAUTHORIZED` without a live account and an `ActingFreelancer` otherwise (unit test with mocked `auth` and cookies).
- [ ] `actingFreelancerForTest()` works with no request mocks.
- [ ] The day-bound helpers live under `lib/services/_shared/time-zone.ts`, with no `next/headers` import there. `lib/helpers/time-zone.ts` re-exports them, and the existing time-zone tests pass unchanged.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
