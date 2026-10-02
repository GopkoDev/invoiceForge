---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "security-patch"
---

# 0002 — Count limited events in a Postgres event log under a per-key advisory lock

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Dmytro Hopko (with Claude during the design walk)

## Context

This feature adds three limits:
- Sign-in links: 5 sent per address per hour.
- Sign-in requests: 30 per source per 5 minutes.
- Data exports: 3 started per Freelancer per hour.

The existing limiter (`LogoFetchWindow`, architecture-hardening ADR-0008) is a per-Freelancer, per-minute counter with a foreign key to `User` and an approximate sliding estimate, so it cannot hold an address digest or a network source. The new rules also need things a counter does not hold:
- Only links actually sent count; refused, invalid and failed requests do not (AC-11).
- An export counts from the moment it starts, a failure on the system's side frees its place again, and concurrent requests never run more than 3 (AC-24).
- The "you can export again at …" time must be exact (AC-24).
- The targeted-lockout alert needs refusals per address per clock hour (spec §6).
- Every record older than 24 h must be purged by a sweep that covers every key (spec §6).

## Decision drivers

- AC-11, AC-12, AC-13, AC-24, AC-25: exact counting semantics, including reservation and release for exports.
- Spec §6 NFR: limiter failure mode is fail-closed for sign-in; retention ≤ 24 h with a global sweep; the lockout alert.
- Spec §6.1: limit records are personal data, kept ≤ 24 h and removed on account deletion where they map to an account.
- §2 constraint: Vercel serverless with no shared memory; Postgres is the only shared store; no new external service (architecture-hardening ADR-0008 precedent); a one-sprint budget.

## Considered options

1. **Event log.** A new `LimitEvent` table holds one row per counted event: `scope`, `key`, `outcome` and `at`, plus an optional `userId` (with a foreign key and cascade on delete) for per-Freelancer scopes. A limit check is `count(*) where scope = … and key = … and outcome in (…) and at > now() − window`, which is an exact sliding window. Check and insert run in one transaction under `pg_advisory_xact_lock(hashtext(scope || key))`, so concurrent requests for the same key queue instead of racing. An export inserts a `started` row up front and flips it to `failed` on a system-side failure, which frees the place.
2. **Generalized counter window.** A `RateLimitWindow(scope, key, windowStart, count)` table using the logo limiter's upsert and approximate sliding estimate.
3. **Managed Redis** (Upstash or Vercel KV) with a rate-limit library.

## Decision outcome

**Chosen:** Option 1. One shape expresses every rule the spec states: sent-only counting, reservation and release, the exact retry time (oldest counted row + window), and refusals per hour for the alert. Purging is a single `DELETE … where at < now() − 24 h` across every key. Option 2 approximates the limit, which can let a sixth link through at a window edge, and it needs side tables for release and for the alert. Option 3 adds a vendor, secrets, cost and a third-party copy of personal data, against the ADR-0008 precedent and the budget.

## Consequences

**Positive**
- Exact limits and an exact "export again at …" time.
- Concurrency-safe without serializable isolation; the lock is per key, so unrelated keys never wait on each other.
- Retention and account deletion are simple deletes: by `at` for the sweep, and by `userId` cascade or by address digest on account deletion.

**Negative**
- More rows than a counter. They are bounded by the limits themselves, not by the attack rate. A source row is written only while the source is under its limit (≤ 30 per source per 5 minutes). At most 5 sent rows per address per hour, and refusal rows, kept only for the lockout alert, at most one per address per UTC hour. The 24 h purge bounds the rest.
- The repo now has two limiter styles. The logo limiter keeps its counter (architecture-hardening ADR-0008) and is not migrated here.
- Each limited request costs one short transaction and an index range scan on `(scope, key, at)`.

**Neutral**
- Migrating the logo limiter onto `LimitEvent` later is possible as its own change.
- If the limit store is unreachable, the sign-in check fails closed (AC-15) and the export refuses with the generic failure. Neither proceeds unlimited.

## Links

- Spec: [[../spec.md]] US-05, US-09, AC-11 – AC-15, AC-23 – AC-25, §6, §6.1
- SAD: [[../sad.md]] §4
- Related ADR: [[0001-enforce-sign-in-email-rules-inside-the-auth-js-email-provider-hooks]]; architecture-hardening ADR-0008 (logo limiter, unchanged)
