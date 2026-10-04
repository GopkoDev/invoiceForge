---
id: T04
title: "Read the Freelancer time zone from the account in both ActingFreelancer factories and save it from settings"
layer: "app"
deps: ["T01"]
blocks: ["T05", "T11"]
acs: ["AC-22"]
files_hint: ["lib/services/_shared/acting-freelancer.ts", "lib/helpers/session-actor.ts", "lib/services/profile/profile.ts", "lib/actions/profile-actions.ts", "lib/validations/profile.ts", "docs/features/architecture-hardening/adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T04 — Read the Freelancer time zone from the account in both ActingFreelancer factories and save it from settings

## Place in the sequence

- **Blocked by:** T01 — Promote the five staged migrations and extend the test support for keys, usage and time zone · **Blocks:** T05 — Add the Time zone card to Profile settings, T11 — Authenticate a presented Personal key and record its last use and weekly usage · **Wave:** 2 — needs `User.timeZone`.
- **Lane:** own lane — this task owns `lib/services/_shared/acting-freelancer.ts` (T11 only imports the key factory).

## Why (user story)

> **As a** Freelancer
> **I want** my time zone saved on my account and used by the dashboard and by every Assistant
> **So that** "overdue", "today" and "this month" mean the same thing wherever I ask
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task moves "today" from the browser cookie onto the account, for both the session and the Personal-key `ActingFreelancer`.

## Inlined context

> **The time zone is saved on the Freelancer's account and decides "today" for every surface.** The browser value only fills it the first time; for existing Freelancers the time zone their browser already carries fills it on their next visit. Until a time zone is saved, the dashboard and every Assistant use UTC alike. This replaces architecture-hardening ADR-0010's browser-cookie rule for the dashboard.
>
> — `spec.md §1, interview decisions, time zone, abridged` · full text: [spec.md](../spec.md)

> **Chosen:** Option 1 — **A nullable `timeZone` column on the account** — every `ActingFreelancer` factory (session and Personal key) reads it; the browser value is saved only when the column is empty; settings change it. This supersedes architecture-hardening ADR-0010 for deciding "today"; the cookie survives only as the first-visit seed. The zone is validated once on save (Intl + `pg_timezone_names`, the existing `resolveTimeZone`).
>
> — `adr/0006-save-the-freelancer-time-zone-on-the-account.md, Option 1 + Decision outcome + Consequences, abridged` · full text: [ADR-0006](../adr/0006-save-the-freelancer-time-zone-on-the-account.md)

> `getActingFreelancer()` (session) reads `User.timeZone`:
> - saved → use it; the browser value is ignored;
> - not saved, and the browser reports a zone that `resolveTimeZone` accepts (the existing architecture-hardening `tz` cookie, now only a seed) → save it with the conditional `updateMany … WHERE timeZone IS NULL` and use it (AC-22);
> - not saved, no valid browser zone → `UTC`, nothing saved.
>
> Both factories (session and Personal key) resolve the same column, so the dashboard and every Assistant answer use the same zone from the next request.
>
> — `contracts/server-actions.md §Freelancer time zone, Session ActingFreelancer factory, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> Flow 12 — `alt no zone saved and the browser reports a valid zone` → save the browser zone on the account, only while it is still empty; `else no zone saved and none reported` → ActingFreelancer with UTC; `else zone already saved` → saved zone, browser value ignored. Settings change: `alt not a known time zone` → validation refusal, time zone not saved.
>
> — `sad.md §6, Flow 12, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** `ActingFreelancer` is built only by trusted factories that resolve the zone once (service-layer ADR-0001); the current single constructor is `createActingFreelancer(userId, rawZone?)` in `lib/services/_shared/acting-freelancer.ts`, called from `lib/helpers/session-actor.ts`.
>
> — `adr/0006-…, Decision drivers, abridged` + `lib/services/_shared/acting-freelancer.ts` at commit 1122814 · full text: [ADR-0006](../adr/0006-save-the-freelancer-time-zone-on-the-account.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `User.timeZone` | TEXT | NULL | read by both factories; written by the first-visit seed and `updateTimeZone` |

> First-visit seed (flow 12): `UPDATE "User" SET "timeZone" = $zone WHERE "id" = $id AND "timeZone" IS NULL` (Prisma `updateMany`). It never overwrites a saved zone, even when two first requests race. Settings change: a plain update by id, after `resolveTimeZone` accepts the zone. An unknown zone is refused, not saved as UTC.

— `data-model.md §Entities, User access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `updateTimeZone(timeZone: string)` → `ActionResult<void>`: saved → `ok()`, revalidates every private page; not a zone both `Intl` and `pg_timezone_names` know → `fail('VALIDATION', TIME_ZONE_MESSAGE, { fieldErrors: { timeZone: [TIME_ZONE_MESSAGE] } })` — never saved as UTC.
- `export const TIME_ZONE_MESSAGE = 'Choose a time zone from the list.';`
- `getProfile` adds `timeZone: string | null` (`null` = not saved yet, shown as UTC). No action clears the zone.
- `actingFreelancerFromPersonalKey(userId, timeZone | null)` — the second trusted factory (used by T11).

— `contracts/server-actions.md §Freelancer time zone, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-22 — happy path

> **Given** a Freelancer with no saved time zone whose browser reports the Kyiv time zone
> **When** they next open the app
> **Then** the Kyiv time zone is saved as their Freelancer time zone and shown in settings, where they can change it. After a change, the dashboard and every Assistant answer use the new time zone from the next request. Until a time zone is saved, the dashboard and every Assistant answer use UTC, and Assistant answers name UTC as the time zone used
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `lib/services/_shared/acting-freelancer.ts` — keep the single cast; add `actingFreelancerFromPersonalKey(userId, timeZone | null)` (NULL → `UTC`).
- [ ] `lib/helpers/session-actor.ts` — read `User.timeZone`; seed from the `tz` cookie via conditional `updateMany` only when NULL and `resolveTimeZone` accepts it; else UTC.
- [ ] `lib/services/profile/profile.ts` — `getProfile` returns `timeZone`; add the save-time-zone service function.
- [ ] `lib/actions/profile-actions.ts` — `updateTimeZone` + `TIME_ZONE_MESSAGE`; revalidate private pages.
- [ ] `lib/validations/profile.ts` — time-zone input schema.
- [ ] `docs/features/architecture-hardening/adr/0010-…md` — status `Superseded` by mcp-server ADR-0006 (docs edit only).
- [ ] Integration tests for the four factory branches and the two `updateTimeZone` outcomes.

## Edge cases

| Case | Behaviour |
|---|---|
| Two first requests race with different browser zones | the first conditional write wins; the second affects 0 rows and uses the saved zone on the next read |
| Cookie carries an invalid zone, nothing saved | UTC, nothing saved |
| Zone saved, browser reports another zone (travel) | saved zone used, cookie ignored |
| `updateTimeZone('Mars/Olympus')` | `VALIDATION` with `TIME_ZONE_MESSAGE`; column unchanged |
| Zone known to `Intl` but not to `pg_timezone_names` | refused (both must accept) |

## Definition of Done

- [ ] Integration tests show the session factory seeds User.timeZone from a valid tz cookie only while it is NULL (a second seed affects 0 rows), uses UTC when nothing is saved or reported, ignores the cookie once a zone is saved, actingFreelancerFromPersonalKey uses the same column, and updateTimeZone saves a known zone and refuses an unknown one with TIME_ZONE_MESSAGE.
- [ ] architecture-hardening ADR-0010 is marked Superseded by mcp-server ADR-0006
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
