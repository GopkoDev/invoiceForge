---
id: T29
title: "Disallow the root and every page of each private section in robots.txt"
layer: "ports"
deps: ["T00", "T02"]
blocks: []
acs: ["AC-30"]
files_hint: ["app/robots.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T29 — Disallow the root and every page of each private section in robots.txt

## Place in the sequence

- **Blocked by:** T02 — Deny unauthenticated requests by default in the proxy, with one public allowlist · **Blocks:** — · **Wave:** wave 4 — the rest (spec §1).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** search engines told not to crawl the private sections of the app
> **So that** crawlers don't pull links to my signed-in area into search results
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task tells crawlers to stay out of the private sections, including their root pages that the current `/section/*` rules miss (A8).

## Inlined context

> Disallows the root and every page of each private section (AC-30, A8), as prefix rules:
> `/dashboard`, `/invoices`, `/customers`, `/products`, `/sender-profiles`, `/settings`,
> `/api/`. Public on the allowlist.
>
> — `contracts/openapi.yaml, /robots.txt description, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

```text
User-Agent: *
Allow: /
Disallow: /dashboard
Disallow: /invoices
Disallow: /customers
Disallow: /products
Disallow: /sender-profiles
Disallow: /settings
Disallow: /api/
Sitemap: https://invoiceforge.hopko.dev/sitemap.xml
```

— `contracts/openapi.yaml, /robots.txt example, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

Current state (code): `app/robots.ts` disallows `/dashboard/*` etc. (misses the section roots) and also `/login`, `/verify-request`, `/error`.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `GET /robots.txt` (`getRobots`), `security: []`, `text/plain` as above.

— `contracts/openapi.yaml, operationId getRobots, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-30 — happy

> **Given** a search engine crawler (a Visitor)
> **When** it reads the app's crawling rules
> **Then** it is told not to crawl the root or any page of each private section
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Replace the disallow list with the prefix rules from the contract (derive from `protectedRoutes` base values + `/api/`); keep the sitemap line — `app/robots.ts`
- [ ] Keep the existing auth-page disallows only if they do not conflict with the contract example (they are not listed there — drop them to match the contract)
- [ ] `curl -s localhost:3000/robots.txt` without cookies

## Edge cases

| Case | Behaviour |
|---|---|
| Crawler requests `/invoices` | Disallowed by prefix (root included) |
| robots.txt requested without a session | Served (allowlisted by T02) |

## Definition of Done

- [ ] `/robots.txt` fetched without cookies matches the contract example (AC-30)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
