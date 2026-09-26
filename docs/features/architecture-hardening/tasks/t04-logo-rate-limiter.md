---
id: T04
title: "Implement the per-Freelancer sliding-window logo rate limiter"
layer: "infra"
deps: ["T00", "T01"]
blocks: ["T05"]
acs: ["AC-03"]
files_hint: ["lib/security/logo-rate-limit.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T04 — Implement the per-Freelancer sliding-window logo rate limiter

## Place in the sequence

- **Blocked by:** T01 — Add the LogoFetchWindow table and Prisma model · **Blocks:** T05 — Rewrite /api/convert-image to fetch only an owned sender profile's logo · **Wave:** wave 1 — the image-conversion security release, shipped alone first (spec §1).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** my sender profile's logo fetched for my PDFs only from safe, real image links
> **So that** my invoices carry my branding and the app can't be abused to reach internal systems
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task enforces "too many requests, try again in a minute" at ≤ 30 real fetches per minute per Freelancer.

## Inlined context

> The counter is incremented only after ownership is confirmed and before the outbound fetch, so refused-before-fetch requests (a foreign profile, no session) never consume quota. Browser-side reuse (ADR-0003) never reaches the server, so it can't count either.
>
> — `adr/0008, Decision outcome, abridged` · full text: [ADR-0008](../adr/0008-rate-limit-logo-fetches-with-a-postgres-sliding-window-counter.md)

> | Logo fetch — rate limit | ≤ 30 fetches per minute per Freelancer; only real fetches from the external address count, and reusing a logo already fetched within the same editor or export session does not | enforced limit; refusal count in logs |
>
> — `spec.md §6, NFR row «Logo fetch — rate limit», verbatim` · full text: [spec.md](../spec.md)

> Increment: `INSERT … VALUES ($userId, $window, 1) ON CONFLICT ("userId","windowStart") DO UPDATE SET "count" = "LogoFetchWindow"."count" + 1 RETURNING "count"` → served by the PK.
> Read the previous window for the sliding estimate: `WHERE "userId" = $1 AND "windowStart" = $prev` → PK.
> Opportunistic cleanup, **scoped to the caller**: `DELETE WHERE "userId" = $1 AND "windowStart" < $prev` → PK prefix. A global sweep is deliberately not used, because it would need an index on `windowStart` alone.
>
> — `data-model.md §Entities, LogoFetchWindow access patterns, verbatim` · full text: [data-model.md](../data-model.md)

> **Hard rule:** Also returned when the rate-limit store is down (ADR-0008 fails closed).
>
> — `contracts/openapi.yaml, /api/convert-image 502, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

> The logo rate limit is a sliding-window estimate, not an exact 60-second log (ADR-0008).
>
> — `sad.md §11, Accepted debt, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `LogoFetchWindow.userId`, `windowStart`, `count` | TEXT / TIMESTAMP(3) / INTEGER | PK (`userId`, `windowStart`) | read + upsert + caller-scoped delete (table created by T01) |

— `data-model.md §Entities, LogoFetchWindow, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. Exposes to T05: `consumeLogoFetch(userId): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }>`; throws (→ caller maps to `UNAVAILABLE`) when the store is unreachable.

## Acceptance criteria

### AC-03 — error

> **Given** a signed-in Freelancer whose logo link is not secure, is unreachable, times out, returns something other than an image, exceeds the size limit, leads (directly or after redirects) to an internal or private network address, or whose logo fetch limit per minute is reached
> **When** the Freelancer generates an invoice PDF
> **Then** the PDF is still produced without the logo, and the Freelancer sees a plain-language warning: a specific reason only for "link is not a secure web address", "file is not an image", "file is larger than the size limit" and "too many requests, try again in a minute"; unreachable, timed-out and internal or private addresses all share one message, "the logo could not be loaded from this link", so the warning never reveals which addresses exist
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Implement `consumeLogoFetch(userId)` with `prisma.$queryRaw` upsert on the current minute (UTC), read the previous window, estimate `prev × (1 − elapsed/60) + current`; allow when ≤ 30 — `lib/security/logo-rate-limit.ts`
- [ ] Compute `retryAfterSeconds` as seconds until the current window closes (1–60)
- [ ] Caller-scoped cleanup `DELETE … WHERE "userId" = $1 AND "windowStart" < $prev` (best-effort, errors swallowed and logged)
- [ ] Do not catch store errors on the upsert — let them propagate so the endpoint fails closed
- [ ] Exercise it from a scratch script against the dev DB: 31 consecutive calls → the 31st is refused

## Edge cases

| Case | Behaviour |
|---|---|
| Two concurrent invocations for the same Freelancer | Both upserts serialize on the PK row; counts stay exact |
| Window boundary (call at :59.9 then :00.1) | Sliding estimate carries most of the previous window; no burst of 60 |
| Store unreachable | Throws → endpoint returns `UNAVAILABLE` (fails closed) |
| Request refused before the limiter (no session, foreign profile, no logo) | Limiter never called; no quota consumed |

## Definition of Done

- [ ] a scratch script shows calls 1–30 allowed and call 31 refused within one minute with `retryAfterSeconds` ∈ [1, 60]
- [ ] only rows of the calling Freelancer are ever deleted
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
