---
id: T4
title: "Make \"signed in\" mean a verified session in the proxy, requireSession and getAuthenticatedUser"
layer: "ports"
deps: ["T1"]
blocks: ["T5"]
acs: ["AC-04", "AC-05", "AC-06"]
files_hint: ["lib/helpers/verified-session.ts", "auth.config.ts", "proxy.ts", "lib/helpers/route-auth.ts", "lib/helpers/auth-helpers.ts", "lib/helpers/session-actor.ts", "tests/unit/proxy.test.ts", "tests/unit/lib/helpers/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T4 — Make "signed in" mean a verified session in the proxy, requireSession and getAuthenticatedUser

## Place in the sequence

- **Blocked by:** T1 — Upgrade Next.js, next-auth and nodemailer (the predicate is tested against the real beta.32 `req.auth` shape) · **Blocks:** T5 — Refuse anonymous non-GET requests in the proxy · **Wave:** 2.
- **Lane:** shares `proxy.ts` and `tests/unit/proxy.test.ts` with T5 — serialized (T4 first).

## Why (user story)

> **As a** Freelancer
> **I want** private pages, data and actions to treat anything short of a verified session as a Visitor
> **So that** a sign-in misconfiguration or error never exposes my data
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task introduces the single `isVerifiedSession` predicate and routes every "signed in?" decision through it, with a failed check treated as a Visitor that keeps its cookies.

## Inlined context

> **"Signed in" means a verified session, decided by one predicate, and a failed check never ends a session.** `isVerifiedSession(x)` is true only when `x?.user?.id` is a non-empty string.
> - The edge config gains an edge-safe `session` callback that copies the JWT's account id into `session.user.id`. The Node config keeps its live-account lookup (architecture-hardening ADR-0002).
> - `proxy.ts`, `requireSession()` and `getAuthenticatedUser()` / `actingFreelancerFromSession()` all use the predicate, so an Auth.js error object or any other truthy non-session is a Visitor (S2, AC-04).
> - The proxy's `catch` branch becomes the ordinary Visitor branch. Public paths render, private pages redirect to sign-in, data and action requests get the 401. It no longer clears session cookies, so a Freelancer is signed in again once the check recovers (AC-04, AC-06).
>
> — `sad.md §4, choice 5, verbatim` · full text: [sad.md](../sad.md)

> P->>P: read session, apply isVerifiedSession · Note: a thrown or malformed check counts as Visitor and session cookies are left untouched · alt verified session → pass through (pages, actions, API) · else public path → render public page, no redirect loop · else data request → not signed in, no data · else private page → redirect to sign-in with callback
>
> — `sad.md §6, Critical flow 2, abridged` (the non-GET branch is T5) · full text: [sad.md](../sad.md)

> **Hard rule:** `auth.config.ts` must stay edge-safe: no Prisma or Nodemailer imports.
>
> — `sad.md §2, Technical constraints, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** A session without a live account is a Visitor (architecture-hardening ADR-0002).
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

> Auth.js beta hook signatures (`normalizeIdentifier`, `sendVerificationRequest`) or the `req.auth` shape change in a later beta — Mitigation: Contract tests of both hooks and of `isVerifiedSession` against real Auth.js output; re-check on every Auth.js upgrade (ADR-0001)
>
> — `sad.md §11, risk row 5, abridged` · full text: [sad.md](../sad.md)

At breakdown time `proxy.ts` calls `clearSessionCookies(req, response)` in its `catch` (around line 75) and redirects to sign-in — both change here.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Every private `/api/*` route and action without a verified session → `401` `NotSignedIn`: `{ success: false, code: "UNAUTHORIZED", error: "Not signed in." }`.
- `SessionCookie` counts as a verified session only when it is validly signed and carries a non-empty account id (`isVerifiedSession`). The Node layer also requires a live `User` row. Anything else is a Visitor, and a failed check never clears the cookie (AC-04).
- Private page without a verified session → redirect to `/login?callbackUrl=…`; public page renders without a redirect loop (AC-06).

— `contracts/openapi.yaml, info "Edge boundary" + components.securitySchemes.SessionCookie + responses.NotSignedIn, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-04 — authorization

> **Given** the sign-in check returns anything other than a verified session, for example an error state caused by a misconfiguration
> **When** that caller requests a private page, private data or a private action
> **Then** the system treats that request as a Visitor's: a page request is sent to sign in, a data or action request is refused with no data, and nothing private runs. A failed check never ends an existing session: once the check recovers, a Freelancer who was signed in is signed in again without signing in anew
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — happy path

> **Given** a Freelancer holds a genuine session issued by the real sign-in flow, not a hand-built one
> **When** they open the dashboard and any other private page
> **Then** they reach it directly and are never bounced back to sign in
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — error

> **Given** the sign-in check itself fails while a Visitor opens the sign-in page or the landing page
> **When** the page loads
> **Then** the page renders without an endless redirect loop, and the Visitor can sign in once the check recovers
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `isVerifiedSession(x)` (edge-safe, no imports beyond types) — `lib/helpers/verified-session.ts`; unit table: `null`, `{}`, `{ user: {} }`, `{ user: { id: '' } }`, an Auth.js error-shaped object, `{ user: { id: 'u1' } }` → only the last is true — `tests/unit/lib/helpers/`.
- [ ] Add the edge-safe `session` callback copying the JWT account id into `session.user.id` — `auth.config.ts`.
- [ ] Use the predicate in the proxy decision and turn the `catch` branch into the Visitor branch (public renders, private page → `/login?callbackUrl=…`, `/api/*` → 401), removing the `clearSessionCookies` call — `proxy.ts`.
- [ ] Use the predicate in `requireSession()` — `lib/helpers/route-auth.ts`; in `getAuthenticatedUser()` — `lib/helpers/auth-helpers.ts`; in `actingFreelancerFromSession()` — `lib/helpers/session-actor.ts`.
- [ ] Extend `tests/unit/proxy.test.ts`: `req.auth` shapes × (public page, private page, `/api/*`) incl. a throwing check; assert no `Set-Cookie` clearing on the throw path; `/login` and `/` render (no redirect) when the check throws.
- [ ] Add a contract test feeding a real Auth.js beta.32 session object (built through the real JWT/session callbacks, not hand-built) through `isVerifiedSession` → true (AC-05).

## Edge cases

| Case | Behaviour |
|---|---|
| `req.auth` is an Auth.js error object (truthy, no `user.id`) | Visitor: private page → sign-in, data/action → 401 |
| The auth check throws | Visitor branch; session cookies untouched; once the check recovers the same cookie signs the Freelancer in again |
| Visitor opens `/login` or `/` while the check fails | Page renders; no redirect loop |
| Valid JWT whose account was deleted | Node layer (`getAuthenticatedUser`) treats it as Visitor (live-account rule unchanged) |
| Genuine session from the real flow | Dashboard and every private page open directly |

## Definition of Done

- [ ] Unit tests of the proxy decision table pass, including the throw path with no cookie clearing (AC-04, AC-06).
- [ ] `isVerifiedSession` contract test against real Auth.js output passes (AC-05).
- [ ] `requireSession()`, `getAuthenticatedUser()` and `actingFreelancerFromSession()` all call `isVerifiedSession`; existing route/action auth tests still pass.
- [ ] `auth.config.ts` has no Prisma / Nodemailer import (edge build passes).
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
