---
id: T05
title: "Rewrite /api/convert-image to fetch only an owned sender profile's logo"
layer: "ports"
deps: ["T00", "T03", "T04"]
blocks: ["T06", "T09"]
acs: ["AC-01", "AC-02", "AC-02b", "AC-03"]
files_hint: ["app/api/convert-image/route.ts", "lib/helpers/route-auth.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T05 — Rewrite /api/convert-image to fetch only an owned sender profile's logo

## Place in the sequence

- **Blocked by:** T03 — Build the IP-pinning safe fetcher with per-hop checks and size/time caps, T04 — Implement the per-Freelancer sliding-window logo rate limiter · **Blocks:** T06 — Request logos by sender-profile id with a per-session cache and show the PDF logo warning, T09 — Treat sessions without a live account as Visitors in layouts and guards · **Wave:** wave 1 — the image-conversion security release, shipped alone first (spec §1).
- **Lane:** shares files with T09 (`lib/helpers/route-auth.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** my sender profile's logo fetched for my PDFs only from safe, real image links
> **So that** my invoices carry my branding and the app can't be abused to reach internal systems
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers the server half of US-01: a logo endpoint that takes an owned profile id, never a URL, and refuses generically.

## Inlined context

> `lib/helpers/route-auth.ts` → `requireSession()` returns the live `userId` or a refusal. Every `app/api/*/route.ts` except next-auth's handler calls it first.
>
> — `adr/0001, Decision outcome «Shape», verbatim` · full text: [ADR-0001](../adr/0001-deny-by-default-in-proxy-with-public-allowlist.md)

> Takes an owned sender-profile id, never a URL (AC-02b, ADR-0003). Order of checks
> (sad.md §6 flow 1): session → live account → profile owned → profile has a logo →
> rate limit (counts only after ownership, before the outbound fetch; ADR-0008) → safe
> fetch (https only, resolved address must be public, re-checked on every redirect hop,
> ≤ 3 hops, ≤ 5 s total, ≤ 512 KB, `image/*` only).
>
> — `contracts/openapi.yaml, /api/convert-image description, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Hard rule:** A refusal never echoes the address, the upstream status or the upstream error text (AC-02, AC-03, spec §6.1). Unreachable, timed out and private/internal destinations share one code, `UNAVAILABLE`.
>
> — `contracts/openapi.yaml, /api/convert-image description, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Hard rule:** | Authorization | `getAuthenticatedUser()` (actions) or `requireSession()` (route handlers) runs **first, before any input is parsed**. Every query is scoped by `userId`. A record that isn't the caller's returns `NOT_FOUND`, identical to a missing one |
>
> — `sad.md §8, row Authorization, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Logging and observability | Existing `console.error` inside `try/catch`, plus Sentry (production). **Load failures and allocator conflicts go to Sentry**; logo-fetch outcomes are structured log lines (§7). No request body or bank detail is logged |
>
> — `sad.md §8, row Logging and observability, verbatim` · full text: [sad.md](../sad.md)

Scope note: `requireSession()` here checks the session and loads the `User` row (fail closed on a missing `user.id`). T09 later makes the same live-account rule apply in layouts and `getAuthenticatedUser()`; it shares this file (serialized lane).

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `SenderProfile.id`, `userId`, `logo` | TEXT | `logo` NULL | read-only — ownership scope + the stored link |

— `data-model.md §Entities, SenderProfile, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `POST /api/convert-image` (`convertLogoImage`), body `LogoFetchRequest` `{ senderProfileId: string (1–64) }`, `additionalProperties: false`.
- `200` `{ success: true, data: { dataUrl: "data:image/…;base64,…", contentType: "image/…", size ≤ 524288 } }`.
- `400` `VALIDATION` "The request is invalid." (body not `{ senderProfileId }`, checked **after** the session).
- `401` `NotSignedIn` · `404` `NOT_FOUND` "Sender profile not found." (missing, foreign, or no logo — identical; no quota consumed).
- `422` `NOT_HTTPS` "The logo link is not a secure web address." / `NOT_IMAGE` "The logo file is not an image." / `TOO_LARGE` "The logo file is larger than 512 KB.".
- `429` `RATE_LIMITED` "Too many requests, try again in a minute." + `Retry-After` 1–60.
- `502` `UNAVAILABLE` "The logo could not be loaded from this link." (unreachable, timeout, redirects, private destination, rate-limit store down).

— `contracts/openapi.yaml, operationId convertLogoImage, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** a signed-in Freelancer whose sender profile logo is a secure link to an image within the size limit
> **When** the Freelancer generates an invoice PDF
> **Then** the PDF includes the logo
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — authorization

> **Given** a Visitor with no signed-in session
> **When** the Visitor asks the app to fetch an image from any address
> **Then** the system refuses without fetching anything, and the refusal reveals nothing about the address
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-02b — authorization

> **Given** a signed-in Freelancer
> **When** the Freelancer asks the app to fetch a logo
> **Then** the system fetches only the logo link stored on a sender profile the Freelancer owns, accepts no other address, and treats a sender profile that isn't theirs as not found
>
> — `spec.md §5, AC-02b, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** a signed-in Freelancer whose logo link is not secure, is unreachable, times out, returns something other than an image, exceeds the size limit, leads (directly or after redirects) to an internal or private network address, or whose logo fetch limit per minute is reached
> **When** the Freelancer generates an invoice PDF
> **Then** the PDF is still produced without the logo, and the Freelancer sees a plain-language warning: a specific reason only for "link is not a secure web address", "file is not an image", "file is larger than the size limit" and "too many requests, try again in a minute"; unreachable, timed-out and internal or private addresses all share one message, "the logo could not be loaded from this link", so the warning never reveals which addresses exist
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Create `requireSession()` (auth() → user id present → `User` row exists, else `401 NotSignedIn` response) — `lib/helpers/route-auth.ts`
- [ ] Parse the body with a strict zod `{ senderProfileId: z.string().min(1).max(64) }` **after** `requireSession()` — `app/api/convert-image/route.ts`
- [ ] Load `SenderProfile` where `{ id, userId }`; missing / foreign / `logo` empty → `404` identical body
- [ ] Call `consumeLogoFetch(userId)` (T04): refused → `429` + `Retry-After`; throws → `502 UNAVAILABLE`
- [ ] Call `safeFetchImage(profile.logo)` (T03) and map codes to 422/502 bodies; success → base64 data URL
- [ ] Delete the old `url`-taking code path entirely (no URL field accepted anywhere)

## Edge cases

| Case | Behaviour |
|---|---|
| Body contains `url` (old client or attacker) | `400 VALIDATION`; nothing fetched |
| Foreign `senderProfileId` | `404` identical to missing; limiter not called |
| Profile with no logo | `404` identical; limiter not called |
| 31st real fetch in a minute | `429 RATE_LIMITED` with `Retry-After` |
| Stored `http://` link saved before AC-04 | `422 NOT_HTTPS` |
| Token of a deleted account | `401 NotSignedIn` (fails closed on the missing `User` row) |

## Definition of Done

- [ ] manual probes against `pnpm dev`: no cookie → 401; foreign id → 404; own https PNG → 200 data URL (AC-01, AC-02, AC-02b)
- [ ] own profile pointing at `http://169.254.169.254/` → 422 `NOT_HTTPS`, at an https host resolving to 127.0.0.1 → 502 `UNAVAILABLE`, bodies never echo the host (AC-03)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
