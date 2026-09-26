---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
ticket: "code-review 2026-09-26: F1, F2, A1"
---

# 0001 — Deny unauthenticated requests in the proxy by default, with an explicit public allowlist

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`proxy.ts` guards page routes only. Its matcher excludes `api` (`proxy.ts:70`), so every `app/api/*` handler starts out public unless it remembers to call `auth()`. That is how `convert-image` became an unauthenticated SSRF proxy (A1, F1), and nothing stops the next handler from doing the same (F2). Spec AC-05 requires deny by default, "including endpoints added in the future", with the public set listed exactly.

## Decision drivers

- Spec §2 goal: a Visitor can reach no endpoint unless it is deliberately public.
- AC-05: page requests go to sign-in; data requests and actions are refused as "not signed in" without data; anything else becomes public only by being added to the list.
- §2 constraint: no automated tests (F7). A convention that relies on remembering a wrapper can't be checked by a test suite.
- `auth.config.ts` must stay edge-safe; the proxy can check the JWT but cannot reach the database.

## Considered options

1. **Proxy covers everything, including `/api`, plus `requireSession()` in every route handler.** One allowlist in `config/routes.config.ts` decides what is public; handlers check the session again as a second layer.
2. **`requireSession()` wrapper in every route handler only; proxy unchanged.** Less change to the proxy, but a forgotten wrapper is a public endpoint.

## Decision outcome

**Chosen:** Option 1. It is the only option where a new endpoint is private without anyone doing anything, which is what AC-05 literally asks for. The per-handler check stays as defense in depth, because the proxy only validates the token signature and never sees whether the account still exists (ADR-0002).

Shape:
- `config/routes.config.ts` holds one `publicRoutes` allowlist: sign-in and sign-up (`/login`, `/verify-request`, `/error`, `/api/auth/*`), `/`, `/privacy`, `/terms`, `robots.txt`, `sitemap.xml`, social-share preview images, app icons and `manifest.json`.
- The proxy matcher covers every path except framework and infrastructure paths that carry no app data: `_next/static`, `_next/image`, and the Sentry tunnel `/monitoring`. These are listed and commented in the matcher, so they are not a silent hole.
- Without a session: a public path passes. Any other page request redirects to sign-in with `callbackUrl`. Any other `/api/*` request or server-action POST gets a "not signed in" refusal with no body data.
- `lib/helpers/route-auth.ts` → `requireSession()` returns the live `userId` or a refusal. Every `app/api/*/route.ts` except next-auth's handler calls it first.

## Consequences

**Positive**
- New endpoints are private by default, and F2 is closed structurally rather than by convention.
- One list answers "what is public?" for reviewers and the Security Lead.

**Negative**
- The matcher regex becomes security-critical. A typo in the exclusion list can open a path; it must be reviewed on every change.
- Next.js server actions POST to page URLs, so the proxy must tell a page navigation (redirect) apart from an action or `fetch` call (refusal). It keys on the `Next-Action` header and the `/api` prefix.

**Neutral**
- The current rule "a Visitor on an unknown path goes to `/`" becomes "goes to sign-in", which AC-05 prescribes.

## Links

- Spec: [[../spec.md]] AC-05, AC-02, AC-23, §6.1
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0002-treat-sessions-without-a-live-account-as-visitors]]
