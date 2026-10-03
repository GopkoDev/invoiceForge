---
id: T19
title: "Serve the enforced content-security policy and transport headers from next.config.ts"
layer: "wiring"
deps: ["T18"]
blocks: ["T20"]
acs: ["AC-20"]
files_hint: ["next.config.ts", "vercel.json", "tests/unit/security-headers.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "done"
---

# T19 — Serve the enforced content-security policy and transport headers from next.config.ts

## Place in the sequence

- **Blocked by:** T18 — Replace the open Sentry rewrite with an app-owned tunnel that forwards only the configured DSN · **Blocks:** T20 — Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit · **Wave:** 3.
- **Lane:** shares `next.config.ts` with T18 (serialized by `deps`) and `vercel.json` with T15 (the `crons` entry) — serialized; keep T15's `crons` block when removing `headers`.

## Why (user story)

> **As a** Freelancer
> **I want** the app to tell my browser to block injected content, refuse framing, use encrypted connections only, and accept only web addresses as customer websites
> **So that** a malicious link or stored value cannot run in my session
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task ships the browser-protection headers themselves; T20 proves they break nothing (the AC-20 zero-violation gate).

## Inlined context

> **Browser security headers.** Served for every route from `next.config.ts` `headers()`, moved from `vercel.json` so they apply identically in preview, production and local runs. **Content-Security-Policy** (enforced): `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; upgrade-insecure-requests`, plus a report endpoint. `'unsafe-inline'` for scripts covers Next.js's inline bootstrap; a per-request nonce policy is a follow-up (spec §3). **Strict-Transport-Security:** `max-age=63072000`, no `includeSubDomains`, no `preload`. **Permissions-Policy:** camera, microphone, geolocation and payment disabled. **X-XSS-Protection:** `0`. Kept as they are: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. The release gate is AC-20: zero violations on the listed flows in preview.
>
> **CSP violation reports.** Sent to Sentry's security endpoint for the current environment's DSN (`report-uri` and `report-to`), so a missed source shows up in error tracking before users report it. **Resolves spec §8 OQ1.**
>
> **HSTS scope.** No subdomains until the mail provider's click-tracking subdomain is confirmed to serve HTTPS. **Resolves spec §8 OQ3** (default kept).
>
> — `sad.md §8, Browser security headers + CSP violation reports + HSTS scope, verbatim` · full text: [sad.md](../sad.md)

> The content-security policy is enforced from the first release, not report-only. A zero-violation gate on the core flows (AC-20) replaces the report-only week.
>
> — `spec.md §1, Decisions, abridged` · full text: [spec.md](../spec.md)

> **Risk:** The enforced content-security policy breaks a flow outside the AC-20 list (for example a third-party script added later) — Medium — Violation reports go to Sentry (§8); AC-20 gate on preview before production; the header lives in `next.config.ts`, so relaxing one directive is a one-line change.
>
> — `sad.md §11, risk row 2, verbatim` · full text: [sad.md](../sad.md)

Code facts at breakdown time: `vercel.json` has a `headers` block for `/(.*)` with `nosniff`, `DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy`; `next.config.ts` exports `withSentryConfig(nextConfig, …)`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) ·
[adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Every response carries `Content-Security-Policy` (enforced, with `report-uri`/`report-to` pointing at the current environment's Sentry security endpoint); `Strict-Transport-Security: max-age=63072000` (no `includeSubDomains`, no `preload`); `Permissions-Policy` with camera, microphone, geolocation and payment disabled; `X-XSS-Protection: 0`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. Served from `next.config.ts` `headers()`, replacing the `vercel.json` block.

— `contracts/openapi.yaml, info "Browser security headers", abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-20 (US-08) — happy path

> **Given** the content-security policy is enforced in a preview environment
> **When** a Freelancer signs in with Google and with a Sign-in link, views the dashboard chart, downloads and prints an invoice PDF, triggers a client-side error, and opens every page in the full page-access sweep (including settings, logo and customer-image previews, the Google profile picture, the data export and the legal pages)
> **Then** every flow completes with zero policy violations, and the client-side error reaches error tracking; the policy is not released to production until all of these pass
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

This task delivers the headers; the preview zero-violation run is T20.

## Checklist

- [ ] `next.config.ts`: add `async headers()` returning one entry `source: '/(.*)'` with the exact CSP string above plus `report-uri <sentry security endpoint>` and `report-to` (with the matching `Reporting-Endpoints` header); build the endpoint from `NEXT_PUBLIC_SENTRY_DSN` (`https://<host>/api/<projectId>/security/?sentry_key=<publicKey>`); omit the report directives when the DSN is unset.
- [ ] Same entry: HSTS `max-age=63072000`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, `X-XSS-Protection: 0`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] Keep the CSP string in one exported constant (or a small builder) so the unit test and T20 read the same value.
- [ ] `vercel.json`: delete the `headers` block; keep `crons` (T15) and every other key.
- [ ] `tests/unit/security-headers.test.ts`: call the config's `headers()`; assert each header and exact CSP directives, no `includeSubDomains`/`preload`, `frame-ancestors 'none'`, `connect-src 'self'` (tunnel only, T18), report endpoint derived from a test DSN; and that `vercel.json` has no `headers` key.

## Edge cases

| Case | Behaviour |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` unset (local / some previews) | CSP still enforced; report directives omitted |
| Browser error reporting | goes to same-origin `/monitoring`, allowed by `connect-src 'self'` |
| Google sign-in form post | allowed by `form-action 'self' https://accounts.google.com` |
| Invoice PDF preview (blob iframe / worker) | allowed by `frame-src 'self' blob:` and `worker-src 'self' blob:` |
| Page embedded in a foreign frame | refused (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) |
| HTTP subresource | upgraded (`upgrade-insecure-requests`) |

## Definition of Done

- [ ] `security-headers.test.ts` passes; `vercel.json` has no `headers` block and still has `crons`.
- [ ] `pnpm dev` local smoke (agent): sign-in page, dashboard, PDF preview load with no console CSP violation.
- [ ] Production release stays gated on T20 (AC-20 zero violations on preview, done by the user).
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
