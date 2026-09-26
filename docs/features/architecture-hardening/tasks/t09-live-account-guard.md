---
id: T09
title: "Treat sessions without a live account as Visitors in layouts and guards"
layer: "app"
deps: ["T00", "T05", "T08"]
blocks: ["T22", "T27"]
acs: ["AC-21"]
files_hint: ["lib/helpers/route-auth.ts", "lib/helpers/auth-helpers.ts", "app/(protected)/layout.tsx", "app/(invoice-editor)/layout.tsx", "auth.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T09 — Treat sessions without a live account as Visitors in layouts and guards

## Place in the sequence

- **Blocked by:** T05 — Rewrite /api/convert-image to fetch only an owned sender profile's logo, T08 — Introduce typed ActionResult error codes and move every action onto them · **Blocks:** T22 — Carry the browser time zone in a validated tz cookie with day-bound helpers, T27 — Harden the data export: session first, parallel reads, Invoice Forge file name · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T05 (`lib/helpers/route-auth.ts`), T08 (`lib/helpers/auth-helpers.ts`), T22 (`app/(protected)/layout.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to export my data and delete my account completely, even when I have invoices, and to have my account settings changed only from my own signed-in session
> **So that** I can leave the product cleanly and no one else can touch my account
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task makes a device still signed in after the account was deleted elsewhere act as a Visitor: signed out, no data, nothing created.

## Inlined context

> **Keep JWT; check that the account is live in the Node layer.** The session callback already loads the `User` row on each `auth()` call and leaves `user.id` unset when the row is gone. Add a `requireLiveUser()` guard to the `(protected)` and `(invoice-editor)` layouts, and let `getAuthenticatedUser()` and `requireSession()` reject a session with no `user.id`.
>
> — `adr/0002, Considered options, option 1 (chosen), verbatim` · full text: [ADR-0002](../adr/0002-treat-sessions-without-a-live-account-as-visitors.md)

> It meets AC-21 with no migration and no forced sign-out, and it reuses a database lookup the session callback already makes. The stale token is cleared and the device lands on sign-in (SCR-01).
>
> — `adr/0002, Decision outcome, abridged` · full text: [ADR-0002](../adr/0002-treat-sessions-without-a-live-account-as-visitors.md)

> **Hard rule:** | next-auth 5.0.0-beta.30: the live-account rule relies on the session callback's database lookup (ADR-0002) | Low | Pin the version; `requireLiveUser()` checks for a missing `user.id` explicitly, so a callback change fails closed | Dmytro Hopko |
>
> — `sad.md §11, risk row «next-auth beta», verbatim` · full text: [sad.md](../sad.md)

>         alt account no longer exists (deleted on another device)
>             S-->>C: treated as a Visitor, signed out, no data, nothing created
>
> — `sad.md §6, flow 4 steps 9–10, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Authorization | `getAuthenticatedUser()` (actions) or `requireSession()` (route handlers) runs **first, before any input is parsed**. Every query is scoped by `userId`. A record that isn't the caller's returns `NOT_FOUND`, identical to a missing one |
>
> — `sad.md §8, row Authorization, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `User.id` | TEXT | PK | read-only — existence check behind the token |

— `data-model.md §ER diagram, User, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- Private `/api/*` with a stale token → `401` `NotSignedIn` (via `requireSession()`); actions → `UNAUTHORIZED` "Not signed in.".

— `contracts/openapi.yaml, components.responses.NotSignedIn, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-21 — authorization

> **Given** a Freelancer who deleted their account while still signed in on another device
> **When** that other device performs any action
> **Then** the device is treated as a Visitor: signed out, shown no data, and nothing is created
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Verify the session callback in `auth.ts` leaves `session.user.id` unset when the `User` row is gone; if it does not, make it so — `auth.ts`
- [ ] Add `requireLiveUser()` (server-only): no `user.id` → `redirect('/login')` after clearing the session cookie via `signOut({ redirect: false })` or equivalent — `lib/helpers/route-auth.ts`
- [ ] Call `requireLiveUser()` at the top of both group layouts — `app/(protected)/layout.tsx`, `app/(invoice-editor)/layout.tsx`
- [ ] Ensure `getAuthenticatedUser()` and `requireSession()` both fail closed on a missing `user.id` — `lib/helpers/auth-helpers.ts`, `lib/helpers/route-auth.ts`
- [ ] Manual check: sign in on two browsers, delete the `User` row (dev DB) and reload / trigger an action on the other

## Edge cases

| Case | Behaviour |
|---|---|
| Stale token opens `/dashboard` | Redirect to sign-in, cookie cleared, no data rendered |
| Stale token fires a create action (e.g. new customer) | `UNAUTHORIZED`, nothing created |
| Stale token calls `/api/user/export` | `401 NotSignedIn` |
| Session callback throws (DB down) | Fails closed: treated as no session, not as a live user |

## Definition of Done

- [ ] with a deleted `User` row: a page load lands on sign-in, a create action returns `UNAUTHORIZED` with nothing created, `/api/*` returns 401 (AC-21)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
