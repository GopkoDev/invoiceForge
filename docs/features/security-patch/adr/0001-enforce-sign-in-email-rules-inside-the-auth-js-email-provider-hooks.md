---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "security-patch"
---

# 0001 — Enforce sign-in email rules inside the Auth.js email provider hooks

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Dmytro Hopko (with Claude during the design walk)

## Context

A Sign-in link can be requested two ways. One is the `signInWithEmail` server action on `/login`. The other is a direct POST to the public `/api/auth/signin/nodemailer` endpoint, which a script can loop with a CSRF token (brief S4). Spec §1 requires the sign-in-email limit to apply "to every route that sends a Sign-in link", and AC-12, AC-13 and AC-17 say the rules hold "whether from the sign-in page or by calling the sign-in service directly". Every such route ends in the same two Auth.js email-provider hooks. `normalizeIdentifier(identifier)` runs before a verification token is created. `sendVerificationRequest({ identifier, url, request, … })` runs to deliver the link, and it receives the incoming `request`, so the platform-reported client address is available.

## Decision drivers

- Spec §1 committed approach: the limit applies at the point every sign-in route shares; spec §6.1 says the same.
- AC-12, AC-13, AC-17: the rules hold for direct calls to the sign-in service too.
- AC-14: the email limit must never block Google sign-in.
- AC-03: one email address belongs to exactly one account, so identity normalization must not change across the upgrade.
- Quality goal 2: the limited response is indistinguishable from a sent one (spec §6, ≤ 150 ms median difference).

## Considered options

1. **Provider hooks.** A custom `normalizeIdentifier` keeps today's identity normalization (trim, lower-case) and refuses addresses over 254 characters or with non-ASCII characters (AC-17). A custom `sendVerificationRequest` runs the limit check (per address and per source), the response-time floor, and the TLS-only send. Every route that sends a link passes through both.
2. **Server action plus a proxy rule.** Check the limits in `signInWithEmail` before `signIn()`, and either block `/api/auth/signin/nodemailer` in the proxy or repeat the check there.

## Decision outcome

**Chosen:** Option 1. One enforcement point covers the action, the direct endpoint and any route a later Auth.js release adds, and it never touches the Google provider (AC-14). Option 2 needs two enforcement points. It also cannot simply block the endpoint, because `signIn('nodemailer')` itself goes through the same provider flow.

Shape:
- The **limit key** for an address is a separate function from identity normalization. It folds letter case, any `+tag`, and dots in Gmail local parts, then takes a keyed digest of the result (spec AC-12). It is used only for counting and never decides which account an address signs into.
- **Outcomes** from `sendVerificationRequest`:
  - sent: the link goes out over verified TLS and is recorded;
  - limited: nothing is sent, the request is held to the same response floor, and the result is the normal "check your inbox";
  - limits unavailable: a typed error that the sign-in page maps to "sign-in by email temporarily unavailable" (AC-15);
  - send failed: a typed error that maps to "could not send, try again" and is reported to Sentry (AC-16).

## Consequences

**Positive**
- A single place to test the limits, the address rule and the TLS rule, through both entry routes.
- Google sign-in is structurally out of scope of the limit.

**Negative**
- Auth.js writes the `VerificationToken` row before `sendVerificationRequest` runs, so a limited request still leaves an unused token. It expires on its own and nobody knows its URL. The per-source limit (30 per 5 minutes) bounds how many such rows one source can create.
- The hook signatures are beta API (next-auth 5.0.0-beta.32). They must be re-checked on every Auth.js upgrade.
- Error signalling from inside the provider (the AC-15 and AC-16 distinction) travels through Auth.js's error wrapping. The sign-in page reads the error type, not message text.

**Neutral**
- The `loginEmailSchema` form check is aligned to the same 254-character / ASCII rule, so the page and the provider agree. The provider stays authoritative.

## Links

- Spec: [[../spec.md]] US-05, US-06, AC-11 – AC-17
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock]]
