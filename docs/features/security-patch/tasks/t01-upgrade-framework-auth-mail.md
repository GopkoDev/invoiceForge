---
id: T1
title: "Upgrade Next.js to 16.3.x, next-auth to 5.0.0-beta.32 and nodemailer to 10.x in one change"
layer: "wiring"
deps: []
blocks: ["T2", "T4", "T6", "T10", "T16", "T18"]
acs: ["AC-01", "AC-02", "AC-03"]
files_hint: ["package.json", "pnpm-lock.yaml", "tests/integration/auth-session-callback.test.ts", "tests/integration/auth/identity-normalization.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T1 — Upgrade Next.js to 16.3.x, next-auth to 5.0.0-beta.32 and nodemailer to 10.x in one change

## Place in the sequence

- **Blocked by:** — · **Blocks:** T2 — Upgrade Prisma to the latest 7.x and remove @prisma/extension-accelerate, T4 — Make "signed in" mean a verified session, T6 — Add the shared five-year Dashboard period rule, T10 — Fail the build on a missing required setting and send mail only over verified TLS, T16 — Accept only http(s) web addresses, T18 — Replace the open Sentry rewrite with an app-owned tunnel · **Wave:** 1 — every hardening step is built against the upgraded APIs, so this lands first.
- **Lane:** shares `package.json` / `pnpm-lock.yaml` with T2 and T10 — serialized. Commit this upgrade **alone**; T2 follows as a separate commit.

## Why (user story)

> **As a** Freelancer
> **I want** the app to run on framework, sign-in and mail components with no known critical or high advisories
> **So that** my account and invoices are not exposed to published exploits
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task performs the single framework + sign-in + mail upgrade and proves nothing regressed, including that one email address still maps to one account.

## Inlined context

> **Dependency upgrades ship together.** The framework, sign-in library and mail library upgrades land in one change. The user's rationale: close every critical advisory at once. The accepted cost is that a regression is harder to bisect.
>
> — `spec.md §1, decisions, verbatim` · full text: [spec.md](../spec.md)

> - Next.js 16.1.1 → **16.3.x** (App Router; the edge guard is `proxy.ts`), with `eslint-config-next` moved in step. React 19.2.
> - next-auth 5.0.0-beta.30 → **5.0.0-beta.32** (`@auth/core` ≥ 0.41.3). Providers are Google and Nodemailer, with JWT sessions (30-day lifetime) and the Prisma adapter. `auth.config.ts` must stay edge-safe: no Prisma or Nodemailer imports.
> - nodemailer 7 → **10.x**.
>
> — `sad.md §2, Technical constraints, abridged` · full text: [sad.md](../sad.md)

> **Upgrade in one change, then harden.** Next.js 16.3.x, next-auth 5.0.0-beta.32 and nodemailer 10.x land in one change (spec §1 decision). The database-toolkit upgrade to Prisma's latest 7.x and the removal of `@prisma/extension-accelerate` (spec §1 hygiene decision, AC-27) follow as a separate commit in the same feature, with the suite run between the two, so a regression bisects to one of them.
>
> — `sad.md §4, choice 6, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Land that upgrade first in the branch, with the Prisma upgrade and accelerate removal as a separate following commit (AC-27), and run the full unit + integration suite and the e2e page-access sweep on preview (AC-02, AC-03) before any hardening step builds on it; rollback is a revert of the upgrade commit
>
> — `sad.md §11, risk row 1 (bisect), verbatim` · full text: [sad.md](../sad.md)

> **Email identity:** unchanged. `User.email` stays `@unique`, and `normalizeIdentifier` keeps the identity normalization (lower-case + trim). The folded limit key never decides account identity (AC-03).
>
> — `data-model.md §User, Email identity, verbatim` · full text: [data-model.md](../data-model.md)

> Production advisories: 0 critical, 0 high — advisory audit in the ship stage. Baseline: 6 critical and 75 high in production packages (production-only advisory audit, 2026-10-02).
>
> — `spec.md §6 NFR row + §7 KPI 1, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy path

> **Given** the release candidate of the app
> **When** the dependency advisory audit runs over the packages that ship to production
> **Then** it reports zero critical and zero high advisories, and the ship notes list every remaining development-only advisory with the reason it is not reachable in production
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — happy path

> **Given** the upgraded components are deployed to a preview environment
> **When** a Freelancer signs in with Google, signs in with a Sign-in link that actually arrives in a real mailbox, and opens every private page
> **Then** every step works as before the upgrade, and the full page-access sweep passes
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — domain invariant

> **Given** a Freelancer whose account was created with an email address before the upgrade
> **When** they request and open a Sign-in link for that same address after the upgrade
> **Then** they land in their existing account with all their data, because one email address belongs to exactly one account, and the system never creates a second, empty account for it
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Bump `next` to 16.3.x, `eslint-config-next` in step, `next-auth` to `5.0.0-beta.32` (verify the resolved `@auth/core` ≥ 0.41.3), `nodemailer` to 10.x (+ its types) — `package.json`, `pnpm-lock.yaml`.
- [ ] Fix compile/lint breakages from the new APIs without adding any hardening behaviour (no provider hooks, no proxy changes beyond what compiles).
- [ ] Re-run `tests/integration/auth-session-callback.test.ts`; adapt only for API shape changes, never weaken assertions.
- [ ] Add `tests/integration/auth/identity-normalization.test.ts`: an existing `User` with `Ana@Example.test` → the email provider's identifier for ` ana@example.test ` resolves to the same `User` (lower-case + trim), and no second `User` row is created (AC-03).
- [ ] Run `pnpm audit --prod` and save the output for T20's ship notes (count critical/high; list what remains).
- [ ] Run the full gate: `pnpm lint`, typecheck, `pnpm test:unit`, `pnpm test:integration`.
- [ ] Commit the upgrade on its own (T2 is a separate commit).

## Edge cases

| Case | Behaviour |
|---|---|
| A transitive dependency still carries a critical/high production advisory after the bump | Pin/override the transitive version in this task, or record it for T20 if only dev tooling is affected |
| Auth.js beta changes the `normalizeIdentifier` default (e.g. no longer lower-cases) | The AC-03 test fails; restore lower-case + trim explicitly, identity must not change |
| `auth.config.ts` pulls a Node-only import after the upgrade | Edge build fails; keep it edge-safe (no Prisma / Nodemailer) |

## Definition of Done

- [ ] `next` 16.3.x, `next-auth` 5.0.0-beta.32, `nodemailer` 10.x in `package.json` and the lockfile, in one commit.
- [ ] `tests/integration/auth/identity-normalization.test.ts` passes (same address → same account, no new `User`, AC-03).
- [ ] Existing unit + integration suite passes unchanged in intent.
- [ ] Production advisory audit output saved for the ship notes (AC-01 is closed by T20).
- [ ] Preview deploy: Google sign-in, Sign-in link to a real mailbox, full page-access sweep pass (AC-02) — **done by the user** on preview.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
