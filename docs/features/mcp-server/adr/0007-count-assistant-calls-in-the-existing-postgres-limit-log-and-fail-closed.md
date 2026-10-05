---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "mcp-server"
---

# 0007 — Count Assistant calls in the existing Postgres limit log and fail closed

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Spec §6 sets a per-key limit of 60 calls per rolling 60 seconds (AC-11), a per-source limit of 30 refused key checks per 5 minutes, and requires the limiter to fail closed. Invoice Forge already counts limited events exactly in a Postgres event log under a per-key advisory lock (security-patch ADR-0002), purged daily (security-patch ADR-0007). Vercel runs many function instances, so any in-process counter would be per-instance and inexact.

## Decision drivers

- Spec §6 NFR: per-key 60/min with no daily cap; 30 refused checks / 5 min / source; 100 % refusal while the limit store is unavailable.
- AC-11: the window is always the most recent 60 seconds; refused calls do not count.
- §2 Organisational: one developer — every new store or service adds operating burden (secrets, monitoring, a second fail-closed path); preferred, not mandated.

## Considered options

1. **Reuse the Postgres limit log** — two new scopes in `LimitEvent`: a per-key scope counting calls that passed the key check, and a per-source scope counting refused key checks; any store error refuses the call.
2. **A hosted Redis/KV counter** (e.g. a sliding window in a managed Redis) — lower per-call cost, but new infrastructure, a new secret and a second store to keep consistent for fail-closed.

## Decision outcome

**Chosen:** Option 1. It is exact across instances, already reviewed, already purged, and its failure mode (database unavailable) coincides with the tools being unable to answer anyway.

## Consequences

**Positive**
- No new dependency; the same tests and purge job cover the new scopes.
- Fail-closed is natural: the check and the data share one database.

**Negative**
- Every Assistant call adds one insert and one count under an advisory lock (a few milliseconds).
- `LimitEvent` grows by up to 60 rows per key per minute between daily purges (tracked in §11).

**Neutral**
- Moving to Redis later swaps the store behind `lib/security/limits` without changing callers. Review triggers (design estimates, not spec NFRs): `LimitEvent` above ~5 million rows per day, or the limit check above 50 ms p95.

## Links

- Spec: [[../spec.md]] §6, §6.1, AC-11
- SAD: [[../sad.md]] §4, §7, §8, §11
- Related ADR: security-patch [[../../security-patch/adr/0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock]]
