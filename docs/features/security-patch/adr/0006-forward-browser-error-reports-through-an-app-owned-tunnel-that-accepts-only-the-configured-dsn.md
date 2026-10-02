---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "security-patch"
---

# 0006 — Forward browser error reports through an app-owned tunnel that accepts only the configured DSN

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Dmytro Hopko (with Claude during the design walk)

## Context

`next.config.ts` sets Sentry's `tunnelRoute: '/monitoring'`, a rewrite that forwards a browser envelope to the Sentry organisation and project named in the request itself. Anyone can therefore deliver reports to their own Sentry project through the app's domain (brief S7). AC-22 requires the relay to refuse reports addressed to any project other than the one configured for the current environment. The tunnel exists so that ad-blockers, which block `*.ingest.sentry.io`, do not drop browser error events. The spec monitors exactly that: browser events arrive within 5 minutes of a synthetic error (§6), and report volume must not drop by more than 50 % after release (§7).

## Decision drivers

- AC-22: forward only to the environment's own project.
- Spec §6 NFR (client error reporting after release) and §7 KPI (no drop of more than 50 % in browser error-report volume).
- Architecture-hardening ADR-0001: `/monitoring` is a listed, commented exclusion from the proxy matcher.

## Considered options

1. **App-owned tunnel route.** Remove `tunnelRoute`. Add `app/monitoring/route.ts`, POST only. It reads the envelope header line, parses its `dsn`, and forwards to Sentry's envelope endpoint only when host and project id match `NEXT_PUBLIC_SENTRY_DSN`; otherwise it returns 403. The browser SDK sets `tunnel: '/monitoring'`.
2. **No tunnel.** Remove `tunnelRoute` and let the browser send directly to Sentry's ingest host, allowed in the CSP `connect-src`.

## Decision outcome

**Chosen:** Option 1. It closes the relay, because no envelope for a foreign DSN is ever forwarded, and it keeps the ad-blocker resilience the monitoring NFR and KPI depend on. Option 2 removes the relay with zero code but measurably drops browser events from technical audiences, which is a portfolio demo's main audience, putting the 50 % KPI at risk.

## Consequences

**Positive**
- The app's domain can no longer carry reports to arbitrary Sentry projects.
- Browser error reporting keeps its current delivery path, and the CSP needs only `connect-src 'self'` for it.

**Negative**
- About 40 lines of app code now own what the SDK did. They must keep up with the envelope format, which is stable but versioned.
- Each browser event costs one serverless invocation (as with the rewrite today).

**Neutral**
- `/monitoring` stays excluded from the proxy matcher (it carries no app data). The route's own DSN check replaces the open rewrite. Per spec §3, the relay is not rate-limited, because Sentry's quota bounds floods into our own project.

## Links

- Spec: [[../spec.md]] US-08, AC-22, §6, §7
- SAD: [[../sad.md]] §5
- Related ADR: architecture-hardening ADR-0001 (matcher exclusions)
