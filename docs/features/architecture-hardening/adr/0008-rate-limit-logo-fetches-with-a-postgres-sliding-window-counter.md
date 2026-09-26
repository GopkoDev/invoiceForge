---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
ticket: "code-review 2026-09-26: A2"
---

# 0008 — Rate-limit logo fetches with a Postgres sliding-window counter

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Spec §6 caps logo fetches at ≤ 30 per minute per Freelancer, and §6.1 notes that open sign-up means anyone can get a session, so a session check alone does not stop resource exhaustion. The app runs as Vercel serverless functions with no shared memory between invocations (§2), so the counter must live in a shared store. The only shared store today is the Neon Postgres database.

## Decision drivers

- §6 NFR: ≤ 30 fetches per minute per Freelancer. Only real fetches from the external address count; a logo reused within the same editor or export session does not.
- §6.1 abuse case: resource exhaustion through the logo link, with open sign-up.
- §2 constraint: serverless, no in-process state across requests.
- Size M: prefer no new external service.

## Considered options

1. **Postgres sliding-window counter.** A `LogoFetchWindow(userId, windowStart, count)` table. Each real fetch does one atomic upsert (`count = count + 1 RETURNING`) on the current one-minute window. The limit is checked as a sliding-window estimate, `current + previous × (1 − elapsed fraction)`, which removes the double burst a plain fixed window allows at the minute boundary. Old rows are deleted opportunistically, and account deletion cascades them.
2. **Managed Redis** (Upstash or Vercel KV) with a rate-limit library. It is the standard tool, faster, and exact, but it adds a new vendor, secrets, cost, and a new failure mode (fail open or fail closed) for one limit in an M-sized feature.

## Decision outcome

**Chosen:** Option 1. It meets the NFR with no new infrastructure, the upsert is race-free under concurrent invocations, and one extra indexed write per real fetch is negligible at ≤ 30 per minute. The counter is incremented only after ownership is confirmed and before the outbound fetch, so refused-before-fetch requests (a foreign profile, no session) never consume quota. Browser-side reuse (ADR-0003) never reaches the server, so it can't count either.

## Consequences

**Positive**
- No new service. The data lives and dies with the Freelancer's account.
- The same table shape can back a future limit on the data export if needed.

**Negative**
- The sliding-window estimate is approximate: it can let through slightly more or fewer than 30 in an exact 60-second span. This is the accepted reading of "≤ 30 per minute" (§10 QG-1).
- A database outage blocks logo fetches (fail closed). The PDF is still produced, without the logo, per AC-03.

**Neutral**
- Moving to Redis later is a contained change inside `lib/security/logo-rate-limit.ts`.

## Links

- Spec: [[../spec.md]] AC-03, §6, §6.1
- SAD: [[../sad.md]] §5, §8
- Related ADR: [[0003-fetch-logos-by-owned-profile-id-through-ip-pinning-fetcher]]
