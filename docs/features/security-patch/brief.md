# Brief — security-patch

> Input for `/sdd:specify security-patch`. Written 2026-10-02 from the read-only security audit and a fresh
> `pnpm audit --prod` (217 advisories: 6 critical, 75 high). Code references point at branch `service-layer`
> @ `f9a6ed3`. Items already fixed or accepted in `docs/features/architecture-hardening/sad.md` §8/§11
> (SSRF-safe logo fetch, deny-by-default proxy, account deletion, numbering) are not repeated.

## Why

The app is about to become a public portfolio demo with an AI chat and later an MCP server. Both add
attack surface and attract automated traffic. Before that, the known holes in the current surface should be
closed: outdated framework and auth packages with published critical advisories, a fail-open session
check in the proxy, an unauthenticated mail-bombing path, and a dashboard link that burns minutes of CPU.
The fixes are small and mostly independent, so this is a short, low-risk feature that ships before `ai-chat`.

## Findings in scope

| ID | Severity | Problem | Where | Failure / exploit | Direction |
|---|---|---|---|---|---|
| S1 | Critical | Outdated `next`, `next-auth`, `@auth/core`, `nodemailer` with published advisories | `package.json`: `next` 16.1.1, `eslint-config-next` 16.1.1, `next-auth` 5.0.0-beta.30 (→ `@auth/core` 0.41.1), `nodemailer` ^7.0.12 | `next` < 16.3.3: unauthenticated RCE and RSC / Server Actions DoS advisories, proxy-bypass advisories (segment prefetch, route-param injection). `next-auth` < beta.32 / `@auth/core` < 0.41.3: email normalizer checks the address before Unicode normalization, so a magic link can be delivered to another mailbox (account takeover); configuration errors fail open. `nodemailer` 7: quadratic-time address parsing on the public sign-in endpoint | Upgrade `next` + `eslint-config-next` to 16.3.x (latest 16.3.8), `next-auth` to 5.0.0-beta.32, `nodemailer` to 10.x; run the full suite and the e2e route sweep |
| S2 | High | The proxy treats any truthy `req.auth` as signed in | `proxy.ts:16,27` (`const token = await req.auth; if (token) …`) | On an Auth.js configuration error `req.auth` becomes a truthy error object; every Visitor takes the signed-in branch and deny-by-default (hardening ADR-0001) is void at the edge | Signed in only when `req.auth?.user?.id` (or email) is present; everything else is a Visitor. Unit test for the error-object shape |
| S3 | High | The dashboard date range is unbounded and the chart still walks every day of it | `lib/validations/search-params.ts` (dashboard params: any `from <= to`), `lib/services/dashboard/dashboard.ts:108` (one array entry per day) | `/dashboard?from=0100-01-01&to=9999-12-31` → ~3.6M day keys per request; any signed-in user (or a link clicked by one) pins a function until timeout | Cap the span (e.g. 5 years); a longer range falls back to the default period like any malformed link; the business function rejects an over-long range with `VALIDATION` |
| S4 | Medium | Unlimited magic-link emails | `lib/actions/login-actions.ts`, public `/api/auth/signin/nodemailer` | A script loops csrf + POST: mail-bombs any address, burns the SMTP quota, gets the sending domain blacklisted → nobody can sign in by email | Reuse the Postgres sliding-window limiter (`lib/security/logo-rate-limit.ts`, hardening ADR-0008) keyed per normalized email and per IP; same "check your inbox" response when limited |
| S5 | Medium | SMTP without enforced TLS; missing mail settings take down all of auth | `lib/get-email-server-config.ts` (no `secure` / `requireTLS`; returns `undefined` when any `EMAIL_*` is missing), `auth.ts:45` | STARTTLS stripping exposes the SMTP password and magic links; a missing `EMAIL_*` makes the Nodemailer provider throw at module load, breaking Google sign-in too (this is what currently fails `pnpm build` in CI) | `secure: port === 465`, `requireTLS: port !== 465`; register the Nodemailer provider only when fully configured, otherwise log one clear startup error; length-cap + ASCII-only `normalizeIdentifier` |
| S6 | Low-Medium | Server actions can be invoked anonymously on public pages | `proxy.ts:51-65` (`isPublicPath` returns before the `Next-Action` check) | Every action authenticates today, so nothing leaks now — but one future action that forgets to (or an Assistant-facing one) would be reachable anonymously despite deny-by-default | Evaluate `isServerAction` before `isPublicPath`; allow only the sign-in actions on `/login` |
| S7 | Low | Sentry tunnel is an open relay; thin security headers | `next.config.ts:29` (`tunnelRoute: '/monitoring'`), `vercel.json` (no CSP, no Permissions-Policy, no explicit HSTS, deprecated `X-XSS-Protection: 1; mode=block`); customer `website` accepts non-http schemes | Anyone can forward arbitrary envelopes to *their own* Sentry org through this domain; no CSP behind user-controlled URLs | Drop `tunnelRoute` or forward only our DSN; add a baseline CSP (`default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; img-src https: data:`), HSTS, Permissions-Policy; set `X-XSS-Protection: 0`; restrict `website` to http(s) |

### Related hygiene (include if cheap)

- `pnpm audit` also lists `hono`, `@hono/node-server` and `@modelcontextprotocol/sdk`. They arrive through
  `prisma` → `@prisma/dev` (local tooling, not the app runtime). Upgrade `prisma` / `@prisma/client` to the
  latest 7.x and re-run the audit; anything left must be dev-only and documented.
- Remove the unused `@prisma/extension-accelerate` dependency (dead supply-chain surface).
- `env.example`: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`; add
  `NEXT_PUBLIC_SENTRY_DSN`.
- Data export (`app/api/user/export/route.ts`) has no rate limit — reuse the same limiter (e.g. 3 per hour per user).

## Out of scope

- Invoice correctness rules — `invoice-integrity` (`docs/features/invoice-integrity/brief.md`).
- Anything AI / MCP specific (tool caps, API tokens, `/api/mcp` proxy exclusion) — designed with those features.
- Moving the Vercel function region next to the database (performance, not security).
- A full nonce-based CSP rollout if the baseline policy breaks something — then ship the baseline in report-only mode and follow up.

## Open questions for specify

1. **S1 upgrade path.** One PR for all upgrades, or `next` separately from `next-auth` + `nodemailer` so a regression is easy to bisect? Is `next-auth` beta.32 acceptable, or is it time to evaluate a stable alternative?
2. **S3 cap.** What is the longest range a Freelancer legitimately needs — 5 years, 10 years, "all time" handled as its own preset (already exists)?
3. **S4 limits.** Exact numbers per email and per IP, and whether the limit applies to Google sign-in too (probably not).
4. **S7 CSP.** Enforce immediately or start with `Content-Security-Policy-Report-Only` for a week?
5. **CI.** Should the CI build keep placeholder `EMAIL_*` values after S5, or should it prove the "provider not configured" path builds cleanly?

## Success criteria (draft)

- `pnpm audit --prod` shows 0 critical and 0 high advisories in packages that run in production; any remaining dev-only ones are listed with a reason.
- A truthy non-session `req.auth` is treated as a Visitor (unit test); the e2e route sweep passes on the upgraded `next`.
- A dashboard request with an over-long range returns the default period within normal latency.
- The N+1-th sign-in email for the same address inside the window is not sent, and the response is indistinguishable from a sent one.
- With any `EMAIL_*` missing, the app builds and Google sign-in works; SMTP refuses to send without TLS.
- No anonymous `Next-Action` POST reaches an action handler except the sign-in ones on `/login`.

## Notes for the pipeline

- Do the `service-layer` CI fix first (placeholder `EMAIL_*` in the build step) and merge `service-layer`; this feature branches from `main` after that.
- Likely size **S–M**, no schema change unless S4 needs a new limiter table (the existing logo limiter table may be reusable — check in design).
- No new UI except possibly a "too many attempts" message on sign-in.
- Suggested route: `specify → clarify → design → plan-tests → tasks → implement → review → ship`; run `/security-review` before ship.
