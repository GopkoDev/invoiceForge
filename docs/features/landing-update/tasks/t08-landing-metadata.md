---
id: T08
title: "Override the landing route's description, openGraph and twitter metadata with the one-sentence promise"
layer: "wiring"
deps: ["T01"]
blocks: ["T09"]
acs: ["AC-12"]
files_hint: ["app/(public)/page.tsx", "tests/unit/landing-metadata.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T08 — Override the landing route's description, openGraph and twitter metadata with the one-sentence promise

## Place in the sequence

- **Blocked by:** T01 — landing content (`landingContent.metadata`) · **Blocks:** T09 — e2e behaviour · **Wave:** 2 (parallel with T03/T07).
- **Lane:** own lane.

## Why (user story)

> **As a** Visitor
> **I want** the first screen to tell me in one line that I can get an invoice from one sentence
> **So that** I know what makes this product different before I scroll
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task carries the promise into search results and link previews.

## Inlined context

> **Metadata:** the landing route overrides `description`, `openGraph` and `twitter` with the one-sentence promise (AC-12); the site-wide description in `config/site.config.ts` stays, so other pages' previews do not change.
>
> — `sad.md §4, supporting choices, verbatim` · full text: [sad.md](../sad.md)

Today `app/(public)/page.tsx` sets `description: siteConfig.meta.description` only; the root layout sets `openGraph`/`twitter` site-wide. Merge rather than drop the root fields (keep images/url from the layout — Next shallow-merges `openGraph`, so restate what must stay).

**Fallback:** read [sad.md](../sad.md) §4 and `app/layout.tsx` metadata. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-12 — happy path

> **Given** a search engine result or a link preview of the landing page
> **When** a Visitor sees it before visiting
> **Then** its description mentions getting an invoice draft from one sentence with AI
>
> — `spec.md §5, AC-12, verbatim`

## Checklist

- [ ] `app/(public)/page.tsx`: `description`, `openGraph.{title,description}`, `twitter.{title,description}` from `landingContent.metadata`, keeping layout-level images/url/siteName
- [ ] `tests/unit/landing-metadata.test.ts`: imports `metadata` and asserts all three descriptions mention one sentence + AI + draft; `siteConfig.meta.description` unchanged

## Edge cases

| Case | Behaviour |
|---|---|
| Other public pages (privacy, terms) | keep the site-wide description |
| OG image from root layout | still present in the landing route's metadata |

## Definition of Done

- [ ] `tests/unit/landing-metadata.test.ts` passes
- [ ] `tsc` + lint clean
