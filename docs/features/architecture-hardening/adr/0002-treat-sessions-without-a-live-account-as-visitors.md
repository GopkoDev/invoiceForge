---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
ticket: "code-review 2026-09-26: L1 (account deletion), spec AC-21"
---

# 0002 — Treat sessions without a live account as Visitors, keeping JWT sessions

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Sessions are next-auth JWTs with a 30-day lifetime (`auth.ts`, `config/jwt.config.ts`). There is no server-side session row that account deletion could revoke. After ADR-0007, a Freelancer can delete their account while still signed in on another device, and AC-21 requires that device to become a Visitor: signed out, no data shown, nothing created. The edge proxy validates only the token signature and has no database access.

## Decision drivers

- AC-21, and spec §6.1: "a session whose account no longer exists is treated as a Visitor".
- §2 constraint: `auth.config.ts` must stay edge-safe; next-auth is a beta (5.0.0-beta.30).
- §6 NFR: 0 minutes of planned downtime, so signing every Freelancer out is undesirable.

## Considered options

1. **Keep JWT; check that the account is live in the Node layer.** The session callback already loads the `User` row on each `auth()` call and leaves `user.id` unset when the row is gone. Add a `requireLiveUser()` guard to the `(protected)` and `(invoice-editor)` layouts, and let `getAuthenticatedUser()` and `requireSession()` reject a session with no `user.id`.
2. **Switch next-auth to database sessions.** Deletion cascades to `Session` rows, so revocation is instant everywhere, but the edge proxy can't read them without an edge-capable adapter, and every Freelancer is signed out on the switch.

## Decision outcome

**Chosen:** Option 1. It meets AC-21 with no migration and no forced sign-out, and it reuses a database lookup the session callback already makes. The stale token is cleared and the device lands on sign-in (SCR-01).

## Consequences

**Positive**
- No schema, adapter or proxy change. Works on the next request after deletion.
- One rule ("no live `user.id` means Visitor") serves pages, actions and route handlers.

**Negative**
- The proxy still lets a stale token through to a page request. The layout redirects on the server before any data renders, so the extra cost is one server render.
- Every Node-side `auth()` call hits the database. It already did; this makes the dependency load-bearing.

**Neutral**
- Moving to database sessions later is still possible, and would make this check redundant rather than wrong.

## Links

- Spec: [[../spec.md]] AC-21, §6.1
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0001-deny-by-default-in-proxy-with-public-allowlist]], [[0007-delete-account-in-one-explicit-transaction-keeping-restrict-fks]]
