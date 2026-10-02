---
id: T8
title: "Build the LimitEvent limit store with per-key advisory locks, limit keys and the opportunistic purge"
layer: "infra"
deps: ["T3"]
blocks: ["T9", "T11", "T13", "T15"]
acs: ["AC-12", "AC-13"]
files_hint: ["lib/security/limits/limit-store.ts", "lib/security/limits/scopes.ts", "lib/security/limits/keys.ts", "tests/unit/security/limits/", "tests/integration/security/limits/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T8 — Build the LimitEvent limit store with per-key advisory locks, limit keys and the opportunistic purge

## Place in the sequence

- **Blocked by:** T3 — Promote the LimitEvent migration with its Prisma model, factory and test cleanup · **Blocks:** T9 — lockout alert, T11 — email provider hooks, T13 — export limit, T15 — purge cron · **Wave:** 4 — the shared engine every limit consumer builds on.
- **Lane:** shares `lib/security/limits/limit-store.ts` with T9 (serialized by the dependency).

## Why (user story)

> **As a** Freelancer
> **I want** the number of Sign-in links sent to my address, and from any single source, to be limited
> **So that** nobody can flood my inbox or burn the app's email capacity, and email sign-in keeps working for everyone
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task builds the exact, concurrency-safe counter and the limit keys that the sign-in (T11) and export (T13) limits run on; it does not wire any caller.

## Inlined context

> **Chosen:** Option 1 (event log). A limit check is `count(*) where scope = … and key = … and outcome in (…) and at > now() − window`, which is an exact sliding window. Check and insert run in one transaction under `pg_advisory_xact_lock(hashtext(scope || key))`, so concurrent requests for the same key queue instead of racing. An export inserts a `started` row up front and flips it to `failed` on a system-side failure, which frees the place. […] the exact retry time (oldest counted row + window). **Neutral:** If the limit store is unreachable, the sign-in check fails closed (AC-15) and the export refuses with the generic failure. Neither proceeds unlimited.
>
> — `adr/0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock.md, Considered options 1 + Decision outcome + Neutral, abridged` · full text: [ADR-0002](../adr/0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock.md)

> L->>DB: per-key locks, count requests per source (5 min) and sent links per address (1 h), record this request for the source only while the source is under its limit
>
> — `sad.md §6, Critical flow 1, verbatim` · full text: [sad.md](../sad.md)

> *New:* an address limit key folds letter case, any `+tag`, and dots in Gmail local parts, then is stored only as HMAC-SHA256 under `LIMIT_KEY_SECRET` (a required setting, ADR-0008). […] it never decides account identity (AC-03). **Client address:** taken only from the hosting platform (`@vercel/functions` `ipAddress()`), never from a header the client can set. IPv4 counts per address, IPv6 per /64 network.
>
> — `sad.md §8, Limit keys + Client address rows, abridged` · full text: [sad.md](../sad.md)

> Source limit keys are stored as HMAC-SHA256 under `LIMIT_KEY_SECRET` too (the folded IPv4 address or IPv6 /64 is digested, never stored raw). No schema impact.
>
> — `tasks stage decision (2026-10-02), TD-1` · resolves `_audit/data-model-2026-10-02.md` flag «Source keys are stored raw»

> **Time handling.** Always insert `at` from the app's clock (`new Date()`, or the test clock in `tests/support/clock.ts`). Bind every cutoff as a parameter computed in the app. Never use `now()` in a window predicate.
> Bounded opportunistic purge on every write (ADR-0007): `DELETE FROM "LimitEvent" WHERE "id" IN (SELECT "id" FROM "LimitEvent" WHERE "at" < $now − 24 h LIMIT 100)`.
>
> — `data-model.md §LimitEvent, Time handling + Access patterns, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** never log or report a raw email address or network address. Only the limit digest appears, and only in the lockout alert.
>
> — `sad.md §8, Logging row, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Scope | Outcome | Written when | Counted by |
|---|---|---|---|
| `SIGNIN_SOURCE` | `REQUESTED` | a well-formed request, recorded only while the source is under its limit | `count(REQUESTED) where at > now − 5 min` ≥ 30 → limited |
| `SIGNIN_ADDRESS` | `SENT` | after SMTP accepted the link; refused, invalid and failed requests write nothing | `count(SENT) where at > now − 1 h` ≥ 5 → limited |
| `EXPORT` | `STARTED` | before any data is read | `count(STARTED) where at > now − 1 h` ≥ 3 → `RATE_LIMITED`; retry at `min(at) + 1 h` |
| `EXPORT` | `FAILED` | the same row, updated from `STARTED` on a system-side failure | not counted |

Columns read/written: `id` (cuid), `scope`, `key`, `outcome`, `at` (app clock), `userId` (EXPORT rows only, = `key`). Indexes used: `LimitEvent_scope_key_at_idx`, `LimitEvent_at_idx`, PK. (`REFUSED` / `ALERTED` rows are T9.)

— `data-model.md §LimitEvent, Outcomes per scope, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-12 — domain invariant

> **Given** an address has already received 5 Sign-in links in the past hour, counting together every spelling of that mailbox: any letter case, any "+tag" after the local part, and, for Gmail addresses, any dots in the local part. This grouping applies to the limit only; which account an address signs into does not change (AC-03)
> **When** anyone requests another link for it, whether from the sign-in page or by calling the sign-in service directly
> **Then** no email is sent, and the requester sees the same "check your inbox" confirmation, with no noticeable difference in wording or response time from a sent link (the link is still sent while the request waits, and a limited request is held for a typical sending time)
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — authorization

> **Given** one source has made 30 Sign-in link requests within 5 minutes
> **When** it requests another link for any address
> **Then** no email is sent, and the requester sees the same "check your inbox" confirmation, with no noticeable difference in wording or response time from a sent link
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

(This task owns the counting and key-grouping half of these ACs; the response-shape half is asserted in T11.)

## Checklist

- [ ] `lib/security/limits/keys.ts`: `foldAddress(email)` (lower-case, strip `+tag`, strip dots in local part for `gmail.com` / `googlemail.com`), `addressLimitKey(email)` = lower-hex HMAC-SHA256(`LIMIT_KEY_SECRET`, folded); `sourceLimitKey(ip)` = IPv4 as-is or IPv6 → /64 prefix, then HMAC (TD-1); `clientSource(request)` via `ipAddress()` from `@vercel/functions` only. Unit tests in `tests/unit/security/limits/keys.test.ts`.
- [ ] `lib/security/limits/scopes.ts`: per-scope config `{ window, max, countedOutcomes }` for `SIGNIN_SOURCE` (5 min, 30, REQUESTED), `SIGNIN_ADDRESS` (1 h, 5, SENT), `EXPORT` (1 h, 3, STARTED).
- [ ] `lib/security/limits/limit-store.ts`: `withKeyLock(scope, key, fn)` = Prisma `$transaction` + `SELECT pg_advisory_xact_lock(hashtext($scope || ':' || $key))`; `countInWindow`, `record(scope, key, outcome, { userId?, at })`, `oldestCountedAt` → `retryAt`, `markFailed(id)`, `purgeOlderThan24h()` (global, returns count, for T15) and a bounded purge (`LIMIT 100`) run on every `record`. All `at` and cutoffs from an injectable clock; no `now()` in SQL.
- [ ] Wrap DB errors as a typed `LimitStoreUnavailable` error so callers can fail closed.
- [ ] Integration tests `tests/integration/security/limits/limit-store.test.ts` (throwaway container): exact window edges with the fake clock; 10 concurrent `EXPORT` reservations for one key → exactly 3 succeed; `markFailed` frees a place; retryAt = oldest + 1 h; bounded purge removes ≤100 rows older than 24 h across keys; Postgres session `TIME ZONE` set to a non-UTC zone gives the same counts.

## Edge cases

| Case | Behaviour |
|---|---|
| `User@Gmail.com`, `u.s.e.r+x@gmail.com` | same key |
| `john.doe@example.com` vs `johndoe@example.com` | different keys (dots folded only for Gmail) |
| two IPv6 addresses in one /64 | same source key |
| concurrent check-and-record for one key | serialized by advisory lock; never over the max |
| different keys | no waiting on each other (except rare hash collisions — harmless, SAD §11) |
| DB unreachable | typed `LimitStoreUnavailable`, nothing recorded |
| non-UTC DB session time zone | windows unchanged (app-bound cutoffs) |

## Definition of Done

- [ ] keys unit tests pass (case/+tag/Gmail-dot folding, IPv6 /64, HMAC output lower hex, raw value never returned)
- [ ] concurrency integration test proves at most `max` reservations per key
- [ ] window, retryAt, release and bounded-purge integration tests pass with the injected clock
- [ ] no raw address or IP appears in any log, error or Sentry payload from this module
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
