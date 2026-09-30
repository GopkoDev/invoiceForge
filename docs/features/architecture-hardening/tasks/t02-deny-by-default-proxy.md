---
id: T02
title: "Deny unauthenticated requests by default in the proxy, with one public allowlist"
layer: "wiring"
deps: ["T00"]
blocks: ["T29"]
acs: ["AC-02", "AC-05"]
files_hint: ["proxy.ts", "config/routes.config.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T02 — Deny unauthenticated requests by default in the proxy, with one public allowlist

## Place in the sequence

- **Blocked by:** — · **Blocks:** T29 — Disallow the root and every page of each private section in robots.txt · **Wave:** wave 1 — the image-conversion security release, shipped alone first (spec §1).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** my sender profile's logo fetched for my PDFs only from safe, real image links
> **So that** my invoices carry my branding and the app can't be abused to reach internal systems
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task makes every non-public page, `/api/*` route and server action unreachable without a session, which structurally closes the open image-conversion endpoint (A1/F1/F2).

## Inlined context

> `config/routes.config.ts` holds one `publicRoutes` allowlist: sign-in and sign-up (`/login`, `/verify-request`, `/error`, `/api/auth/*`), `/`, `/privacy`, `/terms`, `robots.txt`, `sitemap.xml`, social-share preview images, app icons and `manifest.json`.
> The proxy matcher covers every path except framework and infrastructure paths that carry no app data: `_next/static`, `_next/image`, and the Sentry tunnel `/monitoring`. These are listed and commented in the matcher, so they are not a silent hole.
> Without a session: a public path passes. Any other page request redirects to sign-in with `callbackUrl`. Any other `/api/*` request or server-action POST gets a "not signed in" refusal with no body data.
>
> — `adr/0001, Decision outcome «Shape», abridged` · full text: [ADR-0001](../adr/0001-deny-by-default-in-proxy-with-public-allowlist.md)

> Every other path, including paths added later, requires a
> session: a page request is redirected to `/login?callbackUrl=…`; an `/api/*` request or a
> server-action POST (`Next-Action` header) gets `401` with the `NotSignedIn` body and no data.
>
> — `contracts/openapi.yaml, info.description «Public allowlist», abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Hard rule:** - `auth.config.ts` must stay edge-safe (no Prisma or Nodemailer imports), because `proxy.ts` runs on it.
> - `proxy.ts` guards page routes only; its matcher excludes `api` (`proxy.ts:70`).
>
> — `sad.md §2, Technical, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** | The proxy matcher regex and allowlist become security-critical (ADR-0001). A wrong exclusion silently makes a path public | Medium | Every exclusion commented with its reason; the §10 QG-1 route sweep before every release that touches `proxy.ts` or `routes.config.ts` | Dmytro Hopko |
>
> — `sad.md §11, risk row «proxy matcher», verbatim` · full text: [sad.md](../sad.md)

>     else private path and no valid session token
>         alt page request
>             E-->>C: sends to sign-in
>         else data request or action
>             E-->>C: refused as not signed in, no data returned
>         end
>
> — `sad.md §6, flow 4 steps 3–5, abridged` · full text: [sad.md](../sad.md)

Current state (code, 2026-09-27): `proxy.ts` matcher is `/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|opengraph-image|twitter-image|icon|apple-icon).*)` and unknown paths redirect a Visitor to `/`; `routes.config.ts` splits `publicRoutes` / `legalRoutes` / `authRoutes`.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Any private path without a session: page → `302 /login?callbackUrl=<path>`; `/api/*` or a POST with a `Next-Action` header → `401` `NotSignedIn`.
```yaml
NotSignedIn:
  content:
    application/json:
      example:
        success: false
        code: UNAUTHORIZED
        error: "Not signed in."
```

— `contracts/openapi.yaml, components.responses.NotSignedIn, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-02 — authorization

> **Given** a Visitor with no signed-in session
> **When** the Visitor asks the app to fetch an image from any address
> **Then** the system refuses without fetching anything, and the refusal reveals nothing about the address
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — authorization

> **Given** a Visitor with no signed-in session
> **When** the Visitor calls any app endpoint other than a deliberately public one
> **Then** the system denies access by default, including endpoints added in the future: a page request is sent to sign-in, and a data request or action is refused as "not signed in" without returning any data. The deliberately public set is exactly: sign-in and sign-up, the landing page, privacy, terms, the crawling rules and sitemap, social-share preview images, and the app icons and manifest; anything else becomes public only by being added to this list explicitly
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add a single `publicRoutes` allowlist (exact paths + the `/api/auth/` prefix + icon/share-image/manifest paths) and a `isPublicPath(pathname)` helper; keep `authRoutes`/`legalRoutes` exported for existing callers — `config/routes.config.ts`
- [ ] Rewrite the proxy: public → pass; signed-in visiting an auth page → dashboard (unchanged); no token + page → redirect to sign-in with `callbackUrl`; no token + `/api/*` or `Next-Action` POST → `401` JSON `{ success:false, code:"UNAUTHORIZED", error:"Not signed in." }` — `proxy.ts`
- [ ] Change the matcher to exclude only `_next/static`, `_next/image`, `monitoring` (each commented with its reason); `/api` is now covered — `proxy.ts`
- [ ] Keep `auth.config.ts` edge-safe (no new imports into the proxy path)
- [ ] Run the QG-1 probe locally: `curl -si` without cookies against `/`, `/login`, `/robots.txt`, `/sitemap.xml`, `/manifest.json`, `/opengraph-image`, `/dashboard`, `/invoices/x/edit`, `/api/convert-image`, `/api/user/export`, `/some-new-path`

## Edge cases

| Case | Behaviour |
|---|---|
| Visitor → a path added after this change (e.g. `/reports`) | Page → sign-in redirect; it is private unless added to `publicRoutes` |
| Visitor → `POST /api/convert-image` | `401` `NotSignedIn`, the handler never runs, nothing is fetched (AC-02) |
| Visitor → server-action POST (`Next-Action` header) on `/dashboard` | `401` `NotSignedIn`, no data |
| Visitor → `/api/auth/session`, `/api/auth/signin/*` | Passes (next-auth handler is on the allowlist) |
| Malformed / invalid token cookie | Treated as no session; existing catch clears both session cookies and redirects to sign-in |

## Definition of Done

- [ ] cookie-less `curl` sweep: only allowlisted paths return content; private pages 302 to `/login?callbackUrl=…`; `/api/*` and `Next-Action` POSTs return `401` `NotSignedIn` (AC-05, AC-02)
- [ ] signed-in navigation of dashboard, invoices, editor, settings is unchanged
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
