---
id: T5
title: "Refuse anonymous non-GET requests in the proxy and fail CI on any server action without a session guard"
layer: "ports"
deps: ["T4"]
blocks: ["T20"]
acs: ["AC-18", "AC-19"]
files_hint: ["proxy.ts", "config/routes.config.ts", "lib/actions/", "tests/unit/proxy.test.ts", "tests/unit/action-session-guard-scan.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T5 — Refuse anonymous non-GET requests in the proxy and fail CI on any server action without a session guard

## Place in the sequence

- **Blocked by:** T4 — Make "signed in" mean a verified session (the method rule hangs off the same predicate) · **Blocks:** T20 — Gate the release · **Wave:** 3.
- **Lane:** shares `proxy.ts` / `tests/unit/proxy.test.ts` with T4, `config/routes.config.ts` with T15, and `lib/actions/` with T12 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** every server-side action except the sign-in actions on the sign-in page to refuse callers without a verified session
> **So that** an action that forgets its own check can never be invoked anonymously
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task adds both layers of ADR-0003: a method rule at the edge and a CI-scanned session guard on every non-sign-in action.

## Inlined context

> - *Layer 1:* for a request without a verified session, any method other than GET, HEAD or OPTIONS is refused with the "not signed in" 401 before the public-path check. The only exceptions are `/api/auth/*` (the sign-in service, governed by ADR-0001) and POSTs to `/login` (where the sign-in actions are posted).
> - *Layer 2:* every exported function in a `'use server'` module except `lib/actions/login-actions.ts` resolves the session first, through `actingFreelancerFromSession()` or `getAuthenticatedUser()`. A unit test scans those modules and fails CI on any exported action that does not.
>
> — `adr/0003, Considered options 1 (chosen), verbatim` · full text: [adr/0003](../adr/0003-refuse-anonymous-mutations-in-the-proxy-by-method-and-backstop-with-a-scanned-action-guard.md)

> **Backstop guard.** Every `'use server'` export except `signInWithEmail` and `signInWithGoogle` resolves the session first, through `getAuthenticatedUser()` or a known wrapper, and returns `fail('UNAUTHORIZED', 'Not signed in.')` before reading input. A CI scan asserts this for every action file, so a new action without the guard fails the build. This is also what refuses a non-sign-in action posted to `/login`.
>
> — `contracts/server-actions.md §Session rule for every action, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> else not GET, HEAD or OPTIONS, outside the sign-in service and the sign-in page → not signed in, no data · opt action posted to the sign-in page → forwarded → non-sign-in action resolves the session first and refuses → not signed in, no data
>
> — `sad.md §6, Critical flow 2, abridged` · full text: [sad.md](../sad.md)

> **Hard rule (consequence):** Any future public non-GET endpoint (for example a webhook) has to be added to the proxy exception list on purpose. The scan is a static check over source text: it looks for the first statement or a known wrapper, so unusual code shapes need the test updated.
>
> — `adr/0003, Consequences — Negative, abridged` · full text: [adr/0003](../adr/0003-refuse-anonymous-mutations-in-the-proxy-by-method-and-backstop-with-a-scanned-action-guard.md)

At breakdown time `proxy.ts` detects actions only by `req.headers.has('Next-Action')` after `isPublicPath(pathname)` — the method rule must run before `isPublicPath`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Without a verified session, any request whose method is not `GET`, `HEAD` or `OPTIONS` gets `401` `NotSignedIn` (`{ success: false, code: "UNAUTHORIZED", error: "Not signed in." }`), whatever its headers or body encoding. Exceptions: `/api/auth/*` and `/login`, where only the sign-in actions run; any other action posted there refuses itself with `UNAUTHORIZED`.
- `signInWithEmail` and `signInWithGoogle` (`lib/actions/login-actions.ts`) are the only guard-exempt exports.

— `contracts/openapi.yaml, info "Edge boundary", abridged` + `contracts/server-actions.md §Session rule, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-18 — authorization

> **Given** a Visitor on any public page
> **When** they invoke any server-side action other than the sign-in actions, however the request is shaped (with or without the usual action marker, as a form submission or otherwise, sent to any page including the sign-in page)
> **Then** the system refuses without running the action and returns no data. The exemption belongs to the sign-in actions themselves, not to the page they are sent to. A server-side action is anything the framework would run as one; the sign-in service's own endpoints, the sign-in callback and the error-reporting relay are not actions and stay governed by AC-12, AC-13 and AC-22
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy path

> **Given** a Visitor on the sign-in page
> **When** they request a Sign-in link or choose to sign in with Google
> **Then** the sign-in action runs and they continue the sign-in flow as before
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] In `proxy.ts`, before `isPublicPath`: no verified session + method ∉ {GET, HEAD, OPTIONS} + path not `/api/auth/*` + not (POST to `/login`) → 401 `NotSignedIn` JSON.
- [ ] Keep the exception list in one place (`config/routes.config.ts`), commented as deliberate.
- [ ] Extend `tests/unit/proxy.test.ts`: POST to `/` and to a public legal page with and without `Next-Action`, form-encoded and JSON → 401; PUT/DELETE/PATCH → 401; POST `/api/auth/signin/nodemailer` and POST `/login` → passed through; GET public page → renders.
- [ ] Add `tests/unit/action-session-guard-scan.test.ts`: read every `'use server'` module under `lib/actions/`, list exported functions, assert each one's first statement (or a known wrapper) resolves the session via `getAuthenticatedUser()` / `actingFreelancerFromSession()`; only `signInWithEmail` and `signInWithGoogle` exempt; a planted unguarded export fixture fails the scan.
- [ ] Add the guard to any existing action the scan flags — `lib/actions/`.
- [ ] Integration check: a non-sign-in action invoked without a session returns `fail('UNAUTHORIZED', 'Not signed in.')` and touches no data.

## Edge cases

| Case | Behaviour |
|---|---|
| Header-less form POST carrying an action id to a public page | 401 at the edge, action never runs |
| Non-sign-in action id posted to `/login` | Passes the edge; the action's own guard returns `UNAUTHORIZED`, no data |
| `signInWithEmail` / `signInWithGoogle` on `/login` | Runs; sign-in continues (AC-19) |
| POST to `/api/auth/*` (sign-in service) without a session | Passed through; governed by T11's limits |
| GET/HEAD/OPTIONS without a session | Unchanged deny-by-default rules (public renders, private → sign-in, `/api/*` → 401) |
| Signed-in request with any method | Unaffected |

## Definition of Done

- [ ] Proxy unit tests for the method rule pass (AC-18), including header-less and form-encoded shapes.
- [ ] `tests/unit/action-session-guard-scan.test.ts` passes on the current tree and fails on a planted unguarded action.
- [ ] Sign-in actions on `/login` still run (AC-19), covered by a proxy test.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
