---
id: T12
title: "Map sign-in provider outcomes to the fixed messages on the sign-in, check-inbox and error pages"
layer: "ui"
deps: ["T11"]
blocks: ["T20"]
acs: ["AC-15", "AC-16", "AC-17", "AC-19"]
files_hint: ["lib/actions/login-actions.ts", "components/auth/login-form.tsx", "app/(auth)/verify-request/page.tsx", "app/(auth)/error/page.tsx", "tests/integration/actions/login-actions.test.ts", "tests/component/login-form.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T12 — Map sign-in provider outcomes to the fixed messages on the sign-in, check-inbox and error pages

## Place in the sequence

- **Blocked by:** T11 — Enforce the address rule, sign-in-email limits, response floor and TLS-only send in the Auth.js email provider hooks. **Blocks:** T20 — Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit. **Wave:** 7 — needs the typed provider errors from T11.
- **Lane:** `lib/actions/login-actions.ts` sits under T5's `lib/actions/` hint — serialized with T5 (T5 lands earlier by wave; it only reads this file for the scan exemption).

## Why (user story)

> **As a** Visitor signing in by email
> **I want** my Sign-in link sent only over an encrypted mail connection, and only to a well-formed address
> **So that** the link and the mail account's credentials cannot be read or redirected in transit
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task turns the provider's typed outcomes into the exact messages the Visitor sees on SCR-01, SCR-02 and the `/error` page, without ever revealing a limited request.

## Inlined context

> | sent | redirect to `/verify-request` (`signIn` throws `NEXT_REDIRECT`) | `SENT` event recorded after SMTP accepted (AC-11) |
> | limited (address or source) | **identical** redirect to `/verify-request`, after the same response floor | nothing sent. […] |
> | address invalid | `fail('VALIDATION', 'Enter a valid email address.', { fieldErrors: { email: ['Enter a valid email address.'] } })` | nothing sent or counted (AC-17) |
> | limits unavailable | `fail('FAILED', EMAIL_SIGNIN_UNAVAILABLE)` | fail-closed (AC-15) |
> | no TLS / invalid certificate | `fail('FAILED', EMAIL_SEND_FAILED)` | reported to Sentry (AC-16) |
>
> ```ts
> export const EMAIL_SIGNIN_UNAVAILABLE =
>   'Sign-in by email is temporarily unavailable. Try again shortly, or sign in with Google.';
> export const EMAIL_SEND_FAILED = "We couldn't send the sign-in email. Try again.";
> ```
>
> - **Mapping.** The action catches Auth.js's `AuthError` and reads the typed provider error from its `cause` (ADR-0001: the error type decides, never the message text). It then returns one of the two constants. The login form keeps toasting `result.error`. Tests assert against the exported constants.
> - **Limited is never an error.** No result, message, timing or status distinguishes limited from sent (spec §6.1 enumeration).
>
> — `contracts/server-actions.md §signInWithEmail, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **SCR-01 — Sign-in.** loading: the button shows "Sending…" and stays in that state for the response floor on both the sent and the limited path (AC-12, AC-13) — `LoginForm`, `Button` + spinner. validation: `FieldError` "Enter a valid email address." under the email `Input` (AC-17) — `Field`, `Input`, `FieldError`. error: email unavailable: `toast.error` with `EMAIL_SIGNIN_UNAVAILABLE`, Google stays enabled (AC-15) — `Sonner`. error: could not send: `toast.error` with `EMAIL_SEND_FAILED` (AC-16) — `Sonner`. success: link sent **or** limited → SCR-02.
>
> **SCR-02 — Check your inbox.** default: both paths show the same page. **Copy change (D-S1):** "A sign in link has been sent to your email address." is replaced by one neutral line: "If this address can receive sign-in links, we've sent one. Check your inbox." — `Card`, `CardHeader`, `CardDescription`, `CardContent` (existing page).
>
> — `screens.md §SCR-01, §SCR-02, abridged` · full text: [screens.md](../screens.md)

> Auth.js may surface every provider error as one type (`EmailSignin`) on the direct endpoint, which would collapse AC-15 / AC-16 / AC-17 into one `/error` message for direct callers […] **OQ-2** — Pin which Auth.js error type the direct `POST /api/auth/signin/nodemailer` redirect carries for an invalid address, limits unavailable and a send failure on next-auth 5.0.0-beta.32. Map each on the `/error` page. If they collapse into one type, decide whether direct callers get one generic message (the `/login` path is unaffected). […] due: before the sign-in-provider task is closed.
>
> — `contracts/api-sync-report.md §D-8 + Open questions OQ-2, abridged` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> **Hard rule:** Every exported function in a `'use server'` module except `lib/actions/login-actions.ts` resolves the session first […] A unit test scans those modules and fails CI on any exported action that does not.
>
> — `adr/0003 §Considered options, Layer 2, abridged` · full text: [ADR-0003](../adr/0003-refuse-anonymous-mutations-in-the-proxy-by-method-and-backstop-with-a-scanned-action-guard.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `signInWithEmail(email: string): Promise<ActionResult<void>>` — outcomes and constants as inlined above; `signInWithGoogle()` unchanged.
- `POST /api/auth/signin/nodemailer` → `302 Location: /error?error=<type>` for invalid address / limits unavailable / no TLS; the `/error` page maps the type to the plain-language message.

— `contracts/server-actions.md §Sign-in actions` + `contracts/openapi.yaml, operationId requestSignInLink, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-15 — error

> **Given** the system cannot check the sign-in-email limits right now
> **When** a Visitor requests a Sign-in link
> **Then** no email is sent, and the Visitor is told that sign-in by email is temporarily unavailable and that they can try again shortly or sign in with Google
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — error

> **Given** the mail server does not offer an encrypted connection, or offers one whose certificate is not valid for the mail server's name
> **When** the app tries to send a Sign-in link
> **Then** the email is not sent unencrypted, the Visitor sees the generic "could not send, try again" message, and the failure is reported to error tracking
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — error

> **Given** a Visitor requesting a Sign-in link, whether from the sign-in page or by calling the sign-in service directly
> **When** they request it for an address longer than 254 characters or one containing non-ASCII characters
> **Then** the system refuses before sending anything and tells the Visitor to enter a valid email address
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy path

> **Given** a Visitor on the sign-in page
> **When** they request a Sign-in link or choose to sign in with Google
> **Then** the sign-in action runs and they continue the sign-in flow as before
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] OQ-2 spike: on next-auth 5.0.0-beta.32, throw each T11 typed error and record which `error` query type the direct endpoint redirect carries; note the result in the PR and in `contracts/api-sync-report.md` OQ-2 (tick it).
- [ ] `lib/actions/login-actions.ts` — export `EMAIL_SIGNIN_UNAVAILABLE`, `EMAIL_SEND_FAILED`; catch `AuthError`, read `cause` type (never message text), return the mapped `fail('FAILED', …)`; rethrow `NEXT_REDIRECT`; keep `VALIDATION` with `fieldErrors.email`.
- [ ] `components/auth/login-form.tsx` — show `FieldError` for `VALIDATION`; keep `toast.error(result.error)`; button "Sending…" until the response returns (sent and limited alike).
- [ ] `app/(auth)/verify-request/page.tsx` — neutral copy (D-S1).
- [ ] `app/(auth)/error/page.tsx` — map the pinned error types to "Enter a valid email address.", `EMAIL_SIGNIN_UNAVAILABLE`, `EMAIL_SEND_FAILED`; one generic message if types collapse (record the decision).
- [ ] `tests/integration/actions/login-actions.test.ts` — each outcome asserts the exported constant / field error; limited and sent both redirect to `/verify-request`.
- [ ] `tests/component/login-form.test.tsx` — validation field error, both toasts, Google button stays enabled on unavailable.

## Edge cases

| Case | Behaviour |
|---|---|
| Limited request | same redirect + same SCR-02 copy as sent; no toast, no error |
| Auth.js wraps the cause differently than expected | test fails on the type check; never fall back to message-text matching |
| Direct endpoint collapses all errors into `EmailSignin` | `/error` shows one generic message; `/login` path still distinguishes (decision recorded) |
| Expired / used Sign-in link | existing `/error` message, unchanged |
| Google sign-in while email unavailable | unaffected, button enabled |

## Definition of Done

- [ ] OQ-2 resolved and recorded in `contracts/api-sync-report.md`
- [ ] integration + component tests for AC-15, AC-16, AC-17, AC-19 pass, asserting the exported constants
- [ ] SCR-02 copy is the D-S1 neutral line; no wording or status distinguishes limited from sent
- [ ] every Hard Rule inlined above still holds (login actions stay the only scan exemption)
- [ ] lint + typecheck + unit + integration clean
