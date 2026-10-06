---
id: T15
title: "Add the daily limit-record purge job behind the Vercel Cron secret"
layer: "ports"
deps: ["T8", "T10"]
blocks: ["T20"]
acs: []
files_hint: ["app/api/cron/purge-limits/route.ts", "vercel.json", "config/routes.config.ts", "tests/integration/api/purge-limits.test.ts", "tests/unit/routes-config.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T15 — Add the daily limit-record purge job behind the Vercel Cron secret

## Place in the sequence

- **Blocked by:** T8 — Build the LimitEvent limit store with per-key advisory locks, limit keys and the opportunistic purge (provides the global purge function) · T10 — Fail the build on a missing required setting and send mail only over verified TLS (puts `CRON_SECRET` on the required list). **Blocks:** T20 — Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit. **Wave:** 5.
- **Lane:** shares `config/routes.config.ts` with T5 and `vercel.json` with T19 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** the number of Sign-in links sent to my address, and from any single source, to be limited
> **So that** nobody can flood my inbox or burn the app's email capacity, and email sign-in keeps working for everyone
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

No AC maps here; the closest story is US-05 (its limit records are the personal data this job deletes). This task meets the spec §6 retention NFR with a global daily sweep.

## Inlined context

> **Chosen:** Option 1. A daily `crons` entry in `vercel.json` calls `GET /api/cron/purge-limits`. Vercel sends `Authorization: Bearer $CRON_SECRET`. The handler compares the secret in constant time and runs `DELETE FROM "LimitEvent" WHERE at < now() − 24 h`. The path is in the public allowlist and is safe under ADR-0003, because it is a GET. […] its runs are visible in Sentry Crons (`automaticVercelMonitors` is already on). […] A wrong or missing secret gets 401, and `CRON_SECRET` joins the required settings (ADR-0008).
>
> — `adr/0007 §Considered options + Decision outcome + Consequences, abridged` · full text: [ADR-0007](../adr/0007-purge-limit-records-daily-with-a-vercel-cron-job-behind-a-bearer-secret.md)

> C->>S: run the limit-record purge, with the shared secret · alt secret missing or wrong → not authorized, nothing deleted · else secret valid → idempotency check, a delete of rows older than 24 h is safe to run twice, so no run key is needed → check-in, purge run started → delete every limit record older than 24 h, across all keys → check-in, purge run succeeded → done · no retry by the scheduler. The next daily run and the bounded purge on every limit write catch up · alt run failed or never started → missed or failed check-in raises an alert to the app operator
>
> — `sad.md §6, Flow 10, abridged` · full text: [sad.md](../sad.md)

> **Hard rule (time handling):** Bind every cutoff as a parameter computed in the app. Never use `now()` in a window predicate.
>
> — `data-model.md §LimitEvent, Time handling, abridged` · full text: [data-model.md](../data-model.md)

> `/api/cron/purge-limits` must be on the public allowlist, or the proxy returns 401 to Vercel Cron — `tasks` adds it to `config/routes.config.ts`
>
> — `contracts/api-sync-report.md §Findings, D-7, abridged` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `LimitEvent.at` | TIMESTAMP(3) | `LimitEvent_at_idx` | read-only predicate: `DELETE FROM "LimitEvent" WHERE "at" < $cutoff` (cutoff = app clock − 24 h), all scopes and keys |

— `data-model.md §LimitEvent, Access patterns (daily sweep), abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `GET /api/cron/purge-limits` (`purgeLimitRecords`, security `CronSecret`: `Authorization: Bearer $CRON_SECRET`) → `200` `PurgeResult` `{ success: true, data: { deleted: <int ≥ 0> } }` · `401` `ActionError` `{ success:false, code:'UNAUTHORIZED', error:'Not authorized.' }`, nothing deleted · `500` `ActionError` `{ success:false, code:'FAILED', error:'Purge failed.' }`, Crons check-in `error`.
- Sentry Crons check-ins: `in_progress` at start, `ok` or `error` at the end. No `Idempotency-Key`.

— `contracts/openapi.yaml, operationId purgeLimitRecords, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### NFR — Limit-record retention

> | Limit-record retention | records older than 24 h are purged at least daily, by a sweep that covers every key, not only the caller's | integration test + row count checked in the ship stage |
>
> — `spec.md §6, NFR row "Limit-record retention", verbatim` · full text: [spec.md](../spec.md)

> **Personal data touched:** new short-lived limit records hold a normalized email address (or a one-way digest of it) and a network source address, both personal data. They are kept ≤ 24 h, never shown to anyone, and removed by the retention sweep and on account deletion where they map to an account.
>
> — `spec.md §6.1, Personal data touched, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `app/api/cron/purge-limits/route.ts` — `GET` only; constant-time compare of `Authorization` against `Bearer ${CRON_SECRET}` (required setting from T10) before anything else; call T8's global purge with an app-computed cutoff; Sentry Crons check-ins `in_progress` → `ok` / `error`; responses per contract.
- [ ] `vercel.json` — add a daily `crons` entry for `/api/cron/purge-limits` (keep the existing `headers` block; T19 removes it later).
- [ ] `config/routes.config.ts` — add `/api/cron/purge-limits` to the public allowlist; extend `tests/unit/routes-config.test.ts`.
- [ ] `tests/integration/api/purge-limits.test.ts` — rows of every scope older than 24 h deleted, younger kept, `deleted` count exact; missing / wrong secret → 401 and nothing deleted; DB failure → 500 `FAILED`; run twice → second `deleted: 0`. Use the fake clock.

## Edge cases

| Case | Behaviour |
|---|---|
| No `Authorization` header / wrong secret / different length | `401 UNAUTHORIZED`, nothing deleted, no timing leak |
| Run twice the same day | idempotent; second returns `deleted: 0` |
| DB error during delete | `500 FAILED`, check-in `error` → operator alerted |
| Non-UTC DB session time zone | unaffected — cutoff bound from the app clock |
| Non-GET method | not served (proxy refuses anonymous non-GET, ADR-0003) |

## Definition of Done

- [ ] integration test proves the global sweep across all scopes and keys, the 401 and the 500 paths
- [ ] the route is on the public allowlist (unit test) and in `vercel.json` `crons`
- [ ] every Hard Rule inlined above still holds (no `now()` in the predicate)
- [ ] lint + typecheck + unit + integration clean
