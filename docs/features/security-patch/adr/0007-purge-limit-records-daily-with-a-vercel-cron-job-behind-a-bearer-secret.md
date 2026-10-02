---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "security-patch"
---

# 0007 — Purge limit records daily with a Vercel Cron job behind a bearer secret

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Dmytro Hopko (with Claude during the design walk)

## Context

`LimitEvent` rows (ADR-0002) hold personal data: an address digest, a network source, or a Freelancer id. Spec §6 requires records older than 24 h to be purged at least daily, by a sweep that covers every key and not only the caller's. Spec §6.1 keeps them ≤ 24 h. Opportunistic deletes during requests do not run when there is no traffic, so a scheduled job is needed. The app runs on Vercel serverless with no long-lived process. The proxy refuses any `/api/*` request without a session (architecture-hardening ADR-0001), so a scheduled caller needs a deliberate public path with its own credential.

## Decision drivers

- Spec §6 NFR: limit-record retention, with a global daily sweep checked by an integration test and a row count at ship.
- Spec §6.1: limit records are personal data, kept ≤ 24 h.
- §2: Vercel serverless, no new external service, one-sprint budget. All options must work on free plans.

## Considered options

1. **Vercel Cron.** A daily `crons` entry in `vercel.json` calls `GET /api/cron/purge-limits`. Vercel sends `Authorization: Bearer $CRON_SECRET`. The handler compares the secret in constant time and runs `DELETE FROM "LimitEvent" WHERE at < now() − 24 h`. The path is in the public allowlist and is safe under ADR-0003, because it is a GET. Available on the Hobby plan (once per day, ±59 min precision).
2. **GitHub Actions schedule** calling the same route with the secret.
3. **`pg_cron` in Neon** running the delete inside the database.

## Decision outcome

**Chosen:** Option 1. It needs no new infrastructure, runs next to the code it calls, is free on every Vercel plan, and its runs are visible in Sentry Crons (`automaticVercelMonitors` is already on). Option 2 stores a production secret in GitHub, and GitHub disables schedules after 60 days without repository activity, a real risk for a portfolio project that may sit untouched. Option 3 lives outside Prisma migrations, is hard to test against the throwaway container, and does not run while a free-tier Neon compute is suspended.

## Consequences

**Positive**
- A global sweep that runs whether or not anyone uses the app.
- The scheduled run is monitored for misses.

**Negative**
- A new public path guarded by a static secret. A wrong or missing secret gets 401, and `CRON_SECRET` joins the required settings (ADR-0008).
- Hobby precision is ±59 minutes, so between two runs a row can outlive 24 h (worst case ≈ 48 h). This is mitigated in two ways. Every limit read counts only rows inside its window, so stale rows never affect a decision. And every `LimitEvent` write also deletes a bounded batch of rows older than 24 h across all keys, so with any traffic retention stays ≤ 24 h. The residual risk (no traffic and a late run) is recorded in SAD §11.

**Neutral**
- Account deletion removes a Freelancer's rows immediately: `userId` rows by cascade, address-digest rows by digest. That does not wait for the sweep.

## Links

- Spec: [[../spec.md]] §6 (limit-record retention), §6.1
- SAD: [[../sad.md]] §7
- Related ADR: [[0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock]], [[0003-refuse-anonymous-mutations-in-the-proxy-by-method-and-backstop-with-a-scanned-action-guard]], [[0008-fail-the-build-when-a-required-setting-is-missing]]
