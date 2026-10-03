---
id: T11
title: "Enforce the address rule, sign-in-email limits, response floor and TLS-only send in the Auth.js email provider hooks"
layer: "app"
deps: ["T8", "T9", "T10"]
blocks: ["T12"]
acs: ["AC-03", "AC-11", "AC-12", "AC-13", "AC-14", "AC-15", "AC-16", "AC-17"]
files_hint: ["lib/auth/email-provider.ts", "auth.ts", "lib/validations/auth.ts", "tests/integration/auth/email-provider.test.ts", "tests/unit/lib/validations/"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "done"
---

# T11 — Enforce the address rule, sign-in-email limits, response floor and TLS-only send in the Auth.js email provider hooks

## Place in the sequence

- **Blocked by:** T8 — Build the LimitEvent limit store with per-key advisory locks, limit keys and the opportunistic purge · T9 — Record address refusals per UTC hour and raise the targeted-lockout alert · T10 — Fail the build on a missing required setting and send mail only over verified TLS. **Blocks:** T12 — Map sign-in provider outcomes to the fixed messages on the sign-in, check-inbox and error pages. **Wave:** 6 — it composes the limit store, the alert and the TLS transport.
- **Lane:** shares `tests/unit/lib/validations/` (test dir only) with T6 and T16. **Hard gate:** TD-3 (user's read-only production check) must be answered before this task merges.

## Why (user story)

> **As a** Freelancer
> **I want** the number of Sign-in links sent to my address, and from any single source, to be limited
> **So that** nobody can flood my inbox or burn the app's email capacity, and email sign-in keeps working for everyone
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Visitor signing in by email
> **I want** my Sign-in link sent only over an encrypted mail connection, and only to a well-formed address
> **So that** the link and the mail account's credentials cannot be read or redirected in transit
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task builds the one place every Sign-in link passes through — `normalizeIdentifier` and `sendVerificationRequest` — so both the `/login` action and direct calls obey the same rules.

## Inlined context

> **Chosen:** Option 1. One enforcement point covers the action, the direct endpoint and any route a later Auth.js release adds, and it never touches the Google provider (AC-14). […] The **limit key** for an address is a separate function from identity normalization. […] It is used only for counting and never decides which account an address signs into. **Outcomes** from `sendVerificationRequest`: sent: the link goes out over verified TLS and is recorded; limited: nothing is sent, the request is held to the same response floor, and the result is the normal "check your inbox"; limits unavailable: a typed error that the sign-in page maps to "sign-in by email temporarily unavailable" (AC-15); send failed: a typed error that maps to "could not send, try again" and is reported to Sentry (AC-16).
>
> — `adr/0001 §Decision outcome, abridged` · full text: [ADR-0001](../adr/0001-enforce-sign-in-email-rules-inside-the-auth-js-email-provider-hooks.md)

> H->>H: normalizeIdentifier applies the address rule (max 254 chars, ASCII only) · alt address invalid → enter a valid email address (nothing sent, nothing counted) · else H->>L: may a link be sent to this address from this source · L->>DB: per-key locks, count requests per source (5 min) and sent links per address (1 h), record this request for the source only while the source is under its limit · alt limit store unavailable → sign-in by email temporarily unavailable · else address or source limit reached → (refusal + lockout check, T9) → limited → hold until the response floor → check your inbox · else allowed → send link over TLS, certificate checked against host · alt accepted → record link sent for the address → hold until the response floor → check your inbox · else no TLS or invalid certificate → refused before any content is sent → report send failure → could not send, try again
>
> — `sad.md §6, Critical flow 1, abridged` · full text: [sad.md](../sad.md)

> **Response floor (inline decision).** Every "check your inbox" response, for a sent or a limited link, completes no earlier than a configured floor *F* plus a small random jitter. *F* defaults to the p90 send time measured on preview, capped at 1.2 s so the sign-in p95 stays within the spec's ≤ 1.5 s. A sent link that takes longer than *F* responds when the send finishes.
>
> — `sad.md §6, Response floor, abridged` · full text: [sad.md](../sad.md)

> | Sign-in link request, limited vs sent | median response times differ by ≤ 150 ms | integration test, 50 requests of each kind |
> | Sign-in link request, p95 | ≤ 1.5 s | sign-in spans in error tracking |
> | Limiter failure mode (sign-in) | fail-closed: no email when limits cannot be checked | integration test with the limit store unavailable |
>
> — `spec.md §6, NFR rows 2, 3, 6, verbatim` · full text: [spec.md](../spec.md)

> **How verify:** an integration test with 50 limited and 50 sent requests, comparing medians. It runs twice: once with an instant fake SMTP and once with fake-SMTP latency drawn at random between 0 and the response floor *F* (§6), so the floor is proven against send variance and not only against an instant send
>
> — `sad.md §10, QG-2 How verify, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** never log or report a raw email address or network address. Only the limit digest appears, and only in the lockout alert.
>
> — `sad.md §8, Logging, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** `auth.config.ts` must stay edge-safe: no Prisma or Nodemailer imports.
>
> — `sad.md §2, Technical, abridged` · full text: [sad.md](../sad.md)

> a new `auth.signin.email` span records the outcome only (sent / limited / invalid / unavailable / failed), never the address, and feeds the sign-in p95 ≤ 1.5 s NFR and the floor check.
>
> — `sad.md §7, Monitoring, verbatim` · full text: [sad.md](../sad.md)

> One list drives the check, the runtime reads and the `env.example` test […] Runtime code reads the same list, so `auth.ts` has no "undefined" branch.
>
> — `adr/0008 §Considered options + Consequences, abridged` · full text: [ADR-0008](../adr/0008-fail-the-build-when-a-required-setting-is-missing.md)

> Spec §8 OQ2 default kept — refuse non-ASCII. Before this task merges, the **user** runs a read-only check on production accounts for non-ASCII emails (the agent never runs anything against prod; `.env` = dev, `.env.prod` = prod). Any hit blocks this task pending the user's decision.
>
> — `tasks stage decision (2026-10-02), TD-3` · full text: [spec.md §8](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table · Column / value | Change |
|---|---|
| `LimitEvent` · `SIGNIN_SOURCE` / `REQUESTED` | written (via T8's store) for a well-formed request, only while the source is under 30 per 5 min |
| `LimitEvent` · `SIGNIN_ADDRESS` / `SENT` | written after SMTP accepted the link; refused, invalid and failed requests write nothing |
| `LimitEvent` · `SIGNIN_ADDRESS` / `REFUSED`, `ALERTED` | written by T9's module when the address limit refused |
| `VerificationToken` | unchanged; a limited request still leaves an unused token (SAD §11, Low) |

— `data-model.md §LimitEvent, Outcomes per scope, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `POST /api/auth/signin/nodemailer` (`requestSignInLink`, `security: []`) → every outcome `302`: sent or limited → `Location: /verify-request?provider=nodemailer&type=email` (indistinguishable); invalid address, limits unavailable, no TLS → `Location: /error?error=<type>`. Missing/invalid CSRF → Auth.js default, nothing counted.
- Request field: `email` — ≤ 254 characters, ASCII only; authoritative check is the shared `loginEmailSchema`, applied by `normalizeIdentifier`; never stored, only its folded keyed digest.

— `contracts/openapi.yaml, operationId requestSignInLink, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

- `loginEmailSchema` (`lib/validations/auth.ts`) changes from `.max(100)` to **`.max(254)` + ASCII only**. Both messages are `Enter a valid email address.`. The same rule runs again in `normalizeIdentifier`, which is authoritative for direct calls.

— `contracts/server-actions.md §signInWithEmail, Validation, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-03 — domain invariant

> **Given** a Freelancer whose account was created with an email address before the upgrade
> **When** they request and open a Sign-in link for that same address after the upgrade
> **Then** they land in their existing account with all their data, because one email address belongs to exactly one account, and the system never creates a second, empty account for it
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy path

> **Given** an address that has received fewer than 5 Sign-in links in the past hour, and a source that has made fewer than 30 requests in the past 5 minutes (only links actually sent count towards the address limit; refused, invalid and failed requests do not)
> **When** a Visitor requests a Sign-in link for that address
> **Then** the link is sent and the Visitor sees the "check your inbox" confirmation
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** an address has already received 5 Sign-in links in the past hour, counting together every spelling of that mailbox: any letter case, any "+tag" after the local part, and, for Gmail addresses, any dots in the local part. This grouping applies to the limit only; which account an address signs into does not change (AC-03)
> **When** anyone requests another link for it, whether from the sign-in page or by calling the sign-in service directly
> **Then** no email is sent, and the requester sees the same "check your inbox" confirmation, with no noticeable difference in wording or response time from a sent link (the link is still sent while the request waits, and a limited request is held for a typical sending time)
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — authorization

> **Given** one source has made 30 Sign-in link requests within 5 minutes
> **When** it requests another link for any address
> **Then** no email is sent, and the requester sees the same "check your inbox" confirmation, with no noticeable difference in wording or response time from a sent link
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — cross-context

> **Given** a Freelancer's address is currently limited for Sign-in links, for example because someone else flooded it
> **When** the Freelancer signs in with Google for the same account
> **Then** they sign in normally, because the email limit governs sending links and never blocks other sign-in methods
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

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

## Checklist

- [ ] **TD-3 gate:** ask the user to run the read-only production check for accounts with a non-ASCII email (the agent does not connect to prod). Record the answer in this task's PR; any hit → stop and ask.
- [ ] `lib/validations/auth.ts` — `loginEmailSchema`: `.max(254)` + ASCII-only refine, both messages `Enter a valid email address.`; unit table test in `tests/unit/lib/validations/` (254 ok, 255 refused, `ü` refused).
- [ ] `lib/auth/email-provider.ts` — `normalizeIdentifier`: keep today's identity normalization (trim + lower-case) exactly; apply `loginEmailSchema`; throw a typed invalid-address error before any token is created.
- [ ] `lib/auth/email-provider.ts` — `sendVerificationRequest`: read source via T8 key helper (`ipAddress()`, never a client header), call the limit store (source + address under per-key locks), map `limited` → no send + floor; `unavailable` → typed `EmailSigninUnavailable` error (no send); allowed → send through T10's TLS transport, then record `SENT`; TLS/cert failure → typed `EmailSendFailed`, report to Sentry via `failed()`-style single report.
- [ ] Response floor: configurable *F* (default ≤ 1.2 s) + small random jitter, applied to sent and limited paths; a slow send responds when it finishes.
- [ ] `auth.signin.email` Sentry span with outcome attribute only (sent / limited / invalid / unavailable / failed).
- [ ] `auth.ts` — wire the Nodemailer provider to these hooks; read mail settings from T10's required-settings list (no "undefined" branch); keep `auth.config.ts` free of Prisma/Nodemailer.
- [ ] `tests/integration/auth/email-provider.test.ts` — both entry routes (action and direct `POST /api/auth/signin/nodemailer`): AC-11, AC-12 (case / +tag / Gmail dots grouped), AC-13 (31st request from one source), AC-15 (store unavailable → no send), AC-16 (fake SMTP without STARTTLS / bad cert → no send, Sentry captured), AC-17; AC-14 (Google sign-in while address limited); AC-03 (pre-existing user, mixed-case address → same `User.id`, no new row).
- [ ] Timing test: 50 limited vs 50 sent, medians differ ≤ 150 ms; run with instant fake SMTP and with random 0..F latency.

## Edge cases

| Case | Behaviour |
|---|---|
| Address `User+tag@GMail.com` vs `u.s.e.r@gmail.com` | same limit key (grouped); account lookup still uses identity normalization only (AC-03) |
| Limit store throws / DB unreachable | fail-closed: no send, typed unavailable error, Sentry alert; not counted |
| SMTP accepts slower than *F* | response when send finishes; `SENT` recorded |
| SMTP rejects after TLS (non-TLS error) | treated as send failed: no `SENT` row, "could not send" |
| Invalid address | nothing sent, nothing counted, no token |
| Source over limit AND address over limit | limited; refusal row only when the **address** limit refused (T9) |
| Missing/invalid CSRF on direct POST | Auth.js default; hooks never run, nothing counted |
| Raw address / IP in logs or span | never — only outcome; digest only in the lockout alert |

## Definition of Done

- [ ] TD-3 answered by the user (no non-ASCII production accounts, or the user's decision recorded)
- [ ] integration tests for AC-03, AC-11 – AC-17 pass through both entry routes
- [ ] timing test passes in both SMTP-latency modes (median difference ≤ 150 ms)
- [ ] fail-closed test with the limit store unavailable passes
- [ ] every Hard Rule inlined above still holds (no raw address/IP logged; `auth.config.ts` edge-safe)
- [ ] lint + typecheck + unit + integration clean
