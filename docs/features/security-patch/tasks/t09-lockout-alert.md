---
id: T9
title: "Record address refusals per UTC hour and raise the targeted-lockout alert"
layer: "infra"
deps: ["T8"]
blocks: ["T11"]
acs: []
files_hint: ["lib/security/limits/lockout-alert.ts", "lib/security/limits/limit-store.ts", "tests/integration/security/limits/lockout-alert.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

# T9 — Record address refusals per UTC hour and raise the targeted-lockout alert

## Place in the sequence

- **Blocked by:** T8 — Build the LimitEvent limit store with per-key advisory locks, limit keys and the opportunistic purge · **Blocks:** T11 — Enforce the address rule, sign-in-email limits, response floor and TLS-only send in the Auth.js email provider hooks · **Wave:** 5 — runs in parallel with T13 and T15.
- **Lane:** shares `lib/security/limits/limit-store.ts` with T8 (serialized by the dependency).

## Why (user story)

> **As a** Freelancer
> **I want** the number of Sign-in links sent to my address, and from any single source, to be limited
> **So that** nobody can flood my inbox or burn the app's email capacity, and email sign-in keeps working for everyone
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task has no AC of its own: it delivers the targeted-lockout detection the spec puts on US-05's abuse case, so an operator learns when someone keeps a victim's address limited.

## Inlined context

> **Targeted lockout:** an attacker keeps a victim's address limited. Refused requests do not count, so the limit lifts at most 1 hour after the last link sent; Google sign-in is unaffected, and an address refused in 3 consecutive clock hours raises an alert (NFR table).
>
> — `spec.md §6.1, Abuse cases, verbatim` · full text: [spec.md](../spec.md)

> alt address or source limit reached · L->>DB: if the address limit refused, record at most one refusal per address per UTC hour · L->>L: check refusals in 3 consecutive UTC hours · opt third consecutive hour and no alert today → L->>S: targeted-lockout alert carrying the address digest only · L-->>H: limited
>
> — `sad.md §6, Critical flow 1, abridged` · full text: [sad.md](../sad.md)

> Lockout-alert dedupe is a rolling 24 h: no new alert while an `ALERTED` row for the digest exists in the past 24 h (not a UTC calendar day).
>
> — `tasks stage decision (2026-10-02), TD-2` · resolves `_audit/data-model-2026-10-02.md` flag «New outcome ALERTED»

> Compute UTC hour buckets for the lockout alert in the app. Always insert `at` from the app's clock (`new Date()`, or the test clock in `tests/support/clock.ts`).
>
> — `data-model.md §LimitEvent, Time handling, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** never log or report a raw email address or network address. Only the limit digest appears, and only in the lockout alert.
>
> — `sad.md §8, Logging row, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** refusal rows are only for the address limit — a source-limit refusal records nothing; a `REFUSED` row never counts towards the address limit (only `SENT` does).
>
> — `sad.md §8, Rate limiting row + data-model.md §Outcomes per scope, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Scope | Outcome | Written when | Counted by |
|---|---|---|---|
| `SIGNIN_ADDRESS` | `REFUSED` | the address limit refused a request; **at most one per address per UTC hour** (checked under the lock, flow 1) | lockout alert: a `REFUSED` row in each of the current and the two previous UTC hours |
| `SIGNIN_ADDRESS` | `ALERTED` | the targeted-lockout alert was raised for this digest | alert dedupe: no new alert while an `ALERTED` row exists in the past 24 h ("at most once per address per day", spec §6) |

Lookup: `WHERE "scope" = 'SIGNIN_ADDRESS' AND "key" = $digest AND "at" > $cutoff AND "outcome" IN (…)` → `LimitEvent_scope_key_at_idx`.

— `data-model.md §LimitEvent, Outcomes per scope + Access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (Outbound: one Sentry event to the app operator, tagged as the targeted-lockout alert, carrying only the address digest.)

## Acceptance criteria

### NFR — Targeted-lockout alert

> | Targeted-lockout alert | an address refused at least once in each of 3 consecutive clock hours (UTC) raises one alert to the app operator in error tracking, at most once per address per day; the alert carries only the address digest | integration test |
>
> — `spec.md §6, NFR row "Targeted-lockout alert", verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Write `tests/integration/security/limits/lockout-alert.test.ts` first, driving time with `tests/support/clock.ts`.
- [ ] `lib/security/limits/limit-store.ts`: add `recordAddressRefusal(digest, at)` that, inside the existing per-key lock, inserts `REFUSED` only if none exists in the current UTC hour bucket.
- [ ] `lib/security/limits/lockout-alert.ts`: `checkLockout(digest, at)` — under the same lock, look for a `REFUSED` row in each of the current and two previous UTC hour buckets; if all three and no `ALERTED` in the past 24 h (TD-2), insert `ALERTED` and `Sentry.captureMessage` with level warning, a fixed message and `extra: { addressDigest }` only.
- [ ] Expose one call for T11: `onAddressLimited(digest, at)` = record refusal + check lockout; Sentry failure must not throw into the sign-in path.

## Edge cases

| Case | Behaviour |
|---|---|
| 20 refusals in one UTC hour | one `REFUSED` row |
| refusals at 10:59, 11:01, 12:30 UTC | 3 consecutive buckets → one alert |
| refusals in hours 10 and 12 only | no alert (not consecutive) |
| fourth consecutive hour, alert 3 h ago | no new alert (rolling 24 h) |
| 25 h after the last alert, still refused 3 h running | new alert |
| only source limit refused | no `REFUSED` row, no alert |
| Sentry unavailable | sign-in response unaffected; `ALERTED` still recorded |

## Definition of Done

- [ ] integration test proves: one `REFUSED` per UTC hour, alert on 3 consecutive hours, no alert on a gap, one alert per rolling 24 h
- [ ] the Sentry payload contains the digest and no raw address or IP (asserted)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
