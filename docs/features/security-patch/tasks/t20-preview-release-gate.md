---
id: T20
title: "Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit"
layer: "tests"
deps: ["T2", "T5", "T7", "T12", "T14", "T15", "T17", "T19"]
blocks: []
acs: ["AC-01", "AC-02", "AC-05", "AC-20"]
files_hint: ["tests/e2e/csp-gate.spec.ts", "tests/e2e/route-sweep.spec.ts", "tests/e2e/support/", "playwright.config.ts", "docs/features/security-patch/ship-notes.md"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T20 — Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit

## Place in the sequence

- **Blocked by:** T2 — Upgrade Prisma to the latest 7.x and remove @prisma/extension-accelerate · T5 — Refuse anonymous non-GET requests in the proxy and fail CI on any server action without a session guard · T7 — Show the five-year notice in the dashboard filter · T12 — Map sign-in provider outcomes to the fixed messages · T14 — Show "you can export again at …" as an inline alert · T15 — Add the daily limit-record purge job · T17 — Render legacy non-web addresses as plain text · T19 — Serve the enforced content-security policy and transport headers · **Blocks:** — · **Wave:** 8 (last: it exercises every flow the other tasks change).
- **Lane:** own lane (only e2e files + ship notes).

## Why (user story)

> **As a** Freelancer
> **I want** the app to run on framework, sign-in and mail components with no known critical or high advisories
> **So that** my account and invoices are not exposed to published exploits
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** private pages, data and actions to treat anything short of a verified session as a Visitor
> **So that** a sign-in misconfiguration or error never exposes my data
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the app to tell my browser to block injected content, refuse framing, use encrypted connections only, and accept only web addresses as customer websites
> **So that** a malicious link or stored value cannot run in my session
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task proves the hardened app still works end to end on preview and that no critical/high advisory ships — the release gate.

## Inlined context

> **QG-3. Core flows survive the hardening.** Then: every AC-20 flow completes with zero policy violations: Google and Sign-in link sign-in, the dashboard chart, invoice PDF download and print, a client-side error, and the full page-access sweep including settings, logo and customer-image previews, the Google profile picture, the data export and the legal pages; browser error events arrive within 5 min of a synthetic error on production; production advisories: 0 critical, 0 high. How verify: Playwright e2e on preview, collecting `securitypolicyviolation` events and CSP reports (gate: zero) before production release; a post-deploy smoke in the ship stage that throws a synthetic browser error and checks Sentry; an advisory audit of production packages in the ship stage.
>
> — `sad.md §10, QG-3, abridged` · full text: [sad.md](../sad.md)

> QG-1 How verify: the e2e page-access sweep on preview with a genuine session from the real sign-in flow (AC-05).
>
> — `sad.md §10, QG-1 How verify, abridged` · full text: [sad.md](../sad.md)

> | Production advisories | 0 critical, 0 high | advisory audit in the ship stage |
> | Client error reporting after release | browser error events arrive within 5 min of a synthetic error on production | post-deploy smoke in the ship stage |
>
> — `spec.md §6, NFR rows "Production advisories" and "Client error reporting after release", verbatim` · full text: [spec.md](../spec.md)

> **Metric:** Critical/high advisories in production packages. Baseline: 6 critical and 75 high in production packages (production-only advisory audit, 2026-10-02). Target: 0 at merge, still 0 thirty days after release.
>
> — `spec.md §7, KPI 1, verbatim` · full text: [spec.md](../spec.md)

> AC-27: the database toolkit is on its latest 7.x release, the unused database-acceleration extension is no longer a dependency, and every advisory that remains comes only from development tooling and is listed in the ship notes (AC-01).
>
> — `spec.md §5, AC-27 Then, abridged` · full text: [spec.md](../spec.md)

> **Hard rule:** the AC-20 zero-violation release gate is a test gate on preview — the policy is not released to production until all flows pass. The agent never runs anything against production; preview/production checks are run and confirmed by the user.
>
> — `tasks stage decision (2026-10-02), TD-3 scope + spec.md §5 AC-20, abridged` · full text: [spec.md](../spec.md)

Code facts at breakdown time: `tests/e2e/route-sweep.spec.ts` exists (the page-access sweep) with helpers in `tests/e2e/support/` (`app-server.ts`, `route-sweep-exclusion.ts`, `start-app-server.mjs`); `tests/support/session-cookie.ts` builds sessions by hand — AC-05 requires the real sign-in flow instead.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 (US-01) — happy path

> **Given** the release candidate of the app
> **When** the dependency advisory audit runs over the packages that ship to production
> **Then** it reports zero critical and zero high advisories, and the ship notes list every remaining development-only advisory with the reason it is not reachable in production
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 (US-01) — happy path

> **Given** the upgraded components are deployed to a preview environment
> **When** a Freelancer signs in with Google, signs in with a Sign-in link that actually arrives in a real mailbox, and opens every private page
> **Then** every step works as before the upgrade, and the full page-access sweep passes
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-05 (US-02) — happy path

> **Given** a Freelancer holds a genuine session issued by the real sign-in flow, not a hand-built one
> **When** they open the dashboard and any other private page
> **Then** they reach it directly and are never bounced back to sign in
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-20 (US-08) — happy path

> **Given** the content-security policy is enforced in a preview environment
> **When** a Freelancer signs in with Google and with a Sign-in link, views the dashboard chart, downloads and prints an invoice PDF, triggers a client-side error, and opens every page in the full page-access sweep (including settings, logo and customer-image previews, the Google profile picture, the data export and the legal pages)
> **Then** every flow completes with zero policy violations, and the client-side error reaches error tracking; the policy is not released to production until all of these pass
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tests/e2e/support/`: add a CSP collector — `page.addInitScript` registering a `securitypolicyviolation` listener that pushes to `window.__cspViolations`, plus a console listener for CSP messages; a helper asserting the list is empty after each flow.
- [ ] `tests/e2e/support/`: add a genuine-session helper that signs in through the real Sign-in link flow (request link on `/login`, read the link from the test mail sink used in e2e, open it) — not `tests/support/session-cookie.ts`.
- [ ] `tests/e2e/csp-gate.spec.ts`: with the collector on, run sign-in by link, dashboard chart, invoice PDF preview + download + print trigger, a synthetic client error (assert the `/monitoring` POST returns 200 when a DSN is configured), settings (profile avatar, logo and customer-image previews), data export, legal pages; assert zero violations per flow. Google sign-in is covered by the user's preview run (real Google account).
- [ ] `tests/e2e/route-sweep.spec.ts`: switch to the genuine-session helper; assert every private page loads directly (no redirect to `/login`) — AC-05.
- [ ] `playwright.config.ts`: allow a `BASE_URL` / preview-URL override so the same specs run against a preview deploy; local run stays the default.
- [ ] Run `pnpm audit --prod` locally on the release candidate; write `docs/features/security-patch/ship-notes.md` with: prod counts (target 0 critical / 0 high), every remaining dev-only advisory with the reason it is unreachable in production, the Prisma version and confirmation that `@prisma/extension-accelerate` is absent (AC-27).
- [ ] Hand the user the preview checklist (below in DoD) to run and confirm.

## Edge cases

| Case | Behaviour |
|---|---|
| A violation from a browser extension in the user's preview run | ignored only if `sourceFile` is `chrome-extension://…`; otherwise the gate fails |
| No Sentry DSN on the local run | client-error flow asserts the tunnel answers (403 when unconfigured) without a CSP violation; delivery checked on preview by the user |
| `pnpm audit --prod` reports a high advisory | gate fails; do not mark DoD; report back |
| Dev-only advisory | listed in ship notes with reason; does not fail the gate |
| Sweep page redirects to `/login` with a genuine session | AC-05 failure — gate fails |

## Definition of Done

- [ ] `csp-gate.spec.ts` and `route-sweep.spec.ts` pass locally with zero CSP violations and a genuine session.
- [ ] `ship-notes.md` written: 0 critical / 0 high in prod packages, dev-only advisories listed with reasons, AC-27 confirmation.
- [ ] Done by the user on preview: both specs green against the preview URL; Google sign-in and a Sign-in link to a real mailbox work (AC-02); a synthetic client error reaches Sentry; Sentry shows zero CSP reports for the run (AC-20).
- [ ] Production release only after the preview items above are confirmed (no agent action against production).
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
