---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "security-patch"
---

# 0003 — Refuse anonymous mutations in the proxy by method, and backstop with a scanned action guard

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Dmytro Hopko (with Claude during the design walk)

## Context

`proxy.ts` refuses a Visitor's server action only when the POST carries the `Next-Action` header, and only after `isPublicPath` has already let public paths through (brief S6). Next.js also runs an action from a plain form POST whose action id sits in the body, and it runs one posted to any page, public ones included. Action ids are build-specific hashes that the edge proxy cannot map back to "the sign-in actions". AC-18 requires refusing every action except the sign-in actions "however the request is shaped", and it says the exemption belongs to the sign-in actions, not to the page they are sent to.

## Decision drivers

- AC-18, AC-19 and spec §6.1: anonymous action calls are refused whatever their shape, while sign-in keeps working.
- Quality goal 1: fail-closed auth boundary.
- Architecture-hardening ADR-0001: deny by default in the proxy, with a second layer behind it.
- §2: the edge proxy cannot read the server-reference manifest or parse action bodies cheaply.

## Considered options

1. **Refuse by method in the proxy, plus a scanned per-action guard.**
   - *Layer 1:* for a request without a verified session, any method other than GET, HEAD or OPTIONS is refused with the "not signed in" 401 before the public-path check. The only exceptions are `/api/auth/*` (the sign-in service, governed by ADR-0001) and POSTs to `/login` (where the sign-in actions are posted).
   - *Layer 2:* every exported function in a `'use server'` module except `lib/actions/login-actions.ts` resolves the session first, through `actingFreelancerFromSession()` or `getAuthenticatedUser()`. A unit test scans those modules and fails CI on any exported action that does not.
2. **Reorder the proxy only.** Evaluate the `Next-Action` check before `isPublicPath` and allow everything on `/login` (the brief's direction).

## Decision outcome

**Chosen:** Option 1. Refusing by method does not depend on the action marker or on body parsing, so header-less form posts to public pages are refused at the edge. On `/login`, a non-sign-in action is still refused, by its own guard, which keeps the exemption on the sign-in actions rather than on the page (AC-18). Option 2 leaves header-less form posts and any action posted to `/login` reachable anonymously.

## Consequences

**Positive**
- Any mutation sent to a public page without a session is refused at the edge.
- A future action that forgets its session check fails CI, so it never ships.

**Negative**
- Any future public non-GET endpoint (for example a webhook) has to be added to the proxy exception list on purpose.
- The scan is a static check over source text: it looks for the first statement or a known wrapper, so unusual code shapes need the test updated.

**Neutral**
- Signed-in requests are unaffected. Each action keeps its own ownership checks (service-layer ADR-0003).

## Links

- Spec: [[../spec.md]] US-07, AC-18, AC-19
- SAD: [[../sad.md]] §4
- Related ADR: architecture-hardening ADR-0001 (deny by default), ADR-0002 (live account)
