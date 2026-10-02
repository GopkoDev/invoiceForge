---
id: T13
title: "Limit data exports per Freelancer in the business layer and return RATE_LIMITED with a retry time"
layer: "app"
deps: ["T8"]
blocks: ["T14"]
acs: ["AC-23", "AC-24", "AC-25"]
files_hint: ["types/result.ts", "lib/services/account/account.ts", "app/api/user/export/route.ts", "tests/unit/types/action-result.test.ts", "tests/integration/services/account/account.test.ts", "tests/integration/api/user-export.test.ts", "tests/integration/actions/account-deletion.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T13 — Limit data exports per Freelancer in the business layer and return RATE_LIMITED with a retry time

## Place in the sequence

- **Blocked by:** T8 — Build the LimitEvent limit store with per-key advisory locks, limit keys and the opportunistic purge. **Blocks:** T14 — Show "you can export again at …" as an inline alert on the privacy settings screen. **Wave:** 5 — parallel with T9 and T15.
- **Lane:** own lane. **Contract-task rule:** the shared `ActionErrorCode` / `ActionErrorDetails` change in `types/result.ts` is folded into this task (compile-coupled — it cannot land green on its own); every exhaustive `switch` / code map the typecheck flags must handle `RATE_LIMITED` here.

## Why (user story)

> **As a** Freelancer
> **I want** my full data export limited to a few runs per hour, with failed runs not counted
> **So that** a leaked session or a looping script cannot overload the app, while I can still export whenever I need
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task puts the export limit inside `getAccountExport`, adds the typed `RATE_LIMITED` result, maps it to `429` in the route, and removes address-limit rows on account deletion.

## Inlined context

> **Chosen:** Option 1. `getAccountExport` reserves a place through the Limits module (ADR-0002) before reading any data, and releases it if the run fails on the system's side. A refusal returns `fail('RATE_LIMITED', …, { details: { kind: 'RETRY_AT', retryAt } })`. The route maps it to `429` with `Retry-After` […] Extending `ActionErrorCode` touches a type shared by every module and the client. Exhaustive `switch` statements over codes must handle the new case, and TypeScript flags each one.
>
> — `adr/0005 §Considered options + Consequences, abridged` · full text: [ADR-0005](../adr/0005-limit-exports-in-the-business-layer-and-refuse-with-a-typed-rate-limited-result.md)

> S->>D: take the per-key lock for this Freelancer, count export starts minus system-side failures in the past hour · alt fewer than 3 counted exports → record export started, then release the lock → read all of this Freelancer's data · alt export produced → export file (still counts if abandoned afterwards) · else system-side failure → record export failed, which frees the place → export failed, try again · else 3 counted exports in the past hour → rate limited, retry at the time the oldest counted start leaves the window
> Postcondition: concurrent requests never run more than 3 exports per Freelancer per hour. The count is per Freelancer, so another Freelancer on the same network is unaffected
>
> — `sad.md §6, Flow 6, abridged` · full text: [sad.md](../sad.md)

> If the limit store is unreachable, […] the export refuses with the generic failure. Neither proceeds unlimited.
>
> — `adr/0002 §Consequences Neutral, abridged` · full text: [ADR-0002](../adr/0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock.md)

> - `RATE_LIMITED` always carries `details.kind === 'RETRY_AT'`. Route handlers map it to `429` + `Retry-After` (seconds until `retryAt`, rounded up).
> - Exhaustive `switch`es over `ActionErrorCode` must handle the new case […]. The client's code → destination map sends `RATE_LIMITED` to an inline message on the current screen, never to `error.tsx`.
>
> — `contracts/server-actions.md §ActionResult, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Account deletion (`lib/services/account/account.ts` `deleteAccount`, ADR-0007, spec §6.1).** The existing `$transaction` gains one step, before the `User` delete: `prisma.limitEvent.deleteMany({ where: { scope: 'SIGNIN_ADDRESS', key: addressLimitKey(user.email) } })`. `EXPORT` rows go through the `userId` cascade. `SIGNIN_SOURCE` rows never map to an account, so they are left to the 24 h sweep.
>
> — `data-model.md §User, Account deletion, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** Business functions live in `lib/services/` behind `server-only` […]. They take a branded `ActingFreelancer` […] and return the `ActionResult` union with typed codes.
>
> — `sad.md §2, Conventions, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `LimitEvent.scope` = `EXPORT`, `outcome` = `STARTED` | enum | NOT NULL | written before any data is read; counted: `count(STARTED) where at > now − 1 h` ≥ 3 → `RATE_LIMITED`; retry at `min(at) + 1 h` |
| `LimitEvent.outcome` `STARTED → FAILED` | enum | by PK `id` | updated on a system-side failure (frees the place); not counted |
| `LimitEvent.key` / `userId` | TEXT | `userId` FK → `User` ON DELETE CASCADE | both = Freelancer id on `EXPORT` rows |
| `LimitEvent` (`SIGNIN_ADDRESS`, `key = addressLimitKey(email)`) | — | — | deleted inside `deleteAccount` |

— `data-model.md §LimitEvent, Outcomes per scope + Access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `GET /api/user/export` (`exportUserData`) → `200` `UserDataExport` (unchanged, `exportVersion` 2.0) · `401` `NotSignedIn` · `429` `RateLimitedError` `{ success:false, code:'RATE_LIMITED', error:"You've reached the export limit. You can export again later.", details:{ kind:'RETRY_AT', retryAt } }` with `Retry-After` integer seconds 1–3600 · `500` `ActionError` `FAILED` "Your data couldn't be exported. Try again." (read failed → place released; limit store unavailable; account vanished).
- `ActionErrorCode` enum += `RATE_LIMITED`; `RetryAtDetails { kind: 'RETRY_AT'; retryAt: string /* ISO UTC */ }`.

— `contracts/openapi.yaml, operationId exportUserData + schemas ActionErrorCode, RetryAtDetails, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-23 — happy path

> **Given** a Freelancer who has started fewer than 3 data exports in the past hour that did not fail on the system's side
> **When** they request a full data export
> **Then** they receive the export file
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — domain invariant

> **Given** a Freelancer has completed 3 data exports in the past hour
> **When** they request a fourth
> **Then** the system refuses and tells them when they can export again. An export counts from the moment it starts, so several requests sent at once never run more than 3. An export that failed on the system's side frees its place again; one the Freelancer abandoned after the file was produced still counts
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

### AC-25 — authorization

> **Given** two Freelancers sharing one network
> **When** one of them reaches the export limit
> **Then** the other can still export, because the export limit counts per Freelancer and never across accounts
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `types/result.ts` — add `'RATE_LIMITED'` to `ActionErrorCode` and `{ kind: 'RETRY_AT'; retryAt: string }` to `ActionErrorDetails`; extend `tests/unit/types/action-result.test.ts`.
- [ ] Run typecheck; handle `RATE_LIMITED` in every exhaustive switch / code map it flags (client destination: inline message on the current screen, never `error.tsx`).
- [ ] `lib/services/account/account.ts` — `getAccountExport(actor)`: reserve via T8's store (`EXPORT`, key = actor id, `userId` = actor id) before any read; refused → `fail('RATE_LIMITED', …, { details: { kind: 'RETRY_AT', retryAt } })`; read error → flip the reserved row to `FAILED`, `fail('FAILED', …)`; store error → `fail('FAILED', …)`, nothing read.
- [ ] `lib/services/account/account.ts` — `deleteAccount`: add the `SIGNIN_ADDRESS` digest `deleteMany` before the `User` delete.
- [ ] `app/api/user/export/route.ts` — map `RATE_LIMITED` → `429` + `Retry-After = ceil((retryAt − now)/1000)` clamped 1–3600, body as contract.
- [ ] `tests/integration/services/account/account.test.ts` — 3 ok, 4th refused with exact `retryAt`; failed run frees place; 5 concurrent calls → exactly 3 run; two Freelancers independent (AC-25); store unavailable → `FAILED`, nothing read. Use the fake clock.
- [ ] `tests/integration/api/user-export.test.ts` — `429` body + `Retry-After`.
- [ ] `tests/integration/actions/account-deletion.test.ts` — export rows cascade and address-digest rows are gone.

## Edge cases

| Case | Behaviour |
|---|---|
| 5 concurrent requests, 0 prior | per-key lock → exactly 3 `STARTED`, 2 `RATE_LIMITED` |
| Abandoned download after 200 | still counts (no flip) |
| Read fails mid-export | row → `FAILED`, `500 FAILED`, place freed |
| Limit store unavailable | `500 FAILED`, nothing read, never unlimited |
| `retryAt` < 1 s away | `Retry-After: 1` |
| Another Freelancer on the same IP at limit | unaffected (key = Freelancer id) |
| Account deleted | its `EXPORT` rows cascade; `SIGNIN_ADDRESS` digest rows deleted; `SIGNIN_SOURCE` left to sweep |

## Definition of Done

- [ ] integration tests for AC-23, AC-24 (incl. concurrency + release), AC-25 pass
- [ ] `429` response matches `RateLimitedError` + `Retry-After` (contract validator in `tests/support/contract/`)
- [ ] account-deletion test asserts both row kinds gone
- [ ] typecheck passes with `RATE_LIMITED` handled everywhere it is flagged
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
