---
id: T06
title: "Rewrite LandingHero around the one-sentence promise with the demo and drop the stats row"
layer: "ui"
deps: ["T01", "T02", "T05"]
blocks: ["T09"]
acs: ["AC-01", "AC-09"]
files_hint: ["components/landing/landing-hero.tsx", "components/landing/index.ts", "app/(public)/landing-page.tsx", "constants/public-pages-content.ts", "tests/component/landing-hero.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T06 — Rewrite LandingHero around the one-sentence promise with the demo and drop the stats row

## Place in the sequence

- **Blocked by:** T01 — landing content, T02 — JS baseline (must be recorded first), T05 — demo complete · **Blocks:** T09 — e2e behaviour · **Wave:** 5.
- **Lane:** shares `constants/public-pages-content.ts` and `app/(public)/landing-page.tsx` with T01/T07 — serialized.

## Why (user story)

> **As a** Visitor
> **I want** the first screen to tell me in one line that I can get an invoice from one sentence
> **So that** I know what makes this product different before I scroll
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task builds the first screen: badge, headline, supporting line, account button, demo.

## Inlined context

> `landing-hero.tsx` rewritten: badge kept, headline (first h1) + supporting line + account button + `<LandingDemo>`; no stats row, no opacity-0 entrance
>
> — `sad.md §5, internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> The two first-screen qualities are protected instead by local rules: the new hero has no entrance animation that starts the headline at `opacity: 0`, so the headline is in the first paint (QG-1), and the demo adds only its own small player.
>
> — `sad.md §4, choice 2, abridged`

> | default | … Headline is the first `h1`; supporting line; account button visible without scrolling at both reference sizes; no row of three figures (AC-01) | `LandingNav`, `IconBadge` ("Public Beta — Free to Use"), `Button` (account), NEW `LandingDemo` (start frame …) |
>
> — `screens.md SCR-01, state default, abridged` · wireframes A (desktop 1280×800) and B (phone 360×640) in [screens.md](../screens.md)

Today the hero wraps content in `motion.div initial={{ opacity: 0, y: 20 }}` inside `NeonBorderWrapper` (`components/landing/landing-hero.tsx:47-56`) and takes `stats: HeroStat[]`; `landingContent.hero.stats` is typed `StatItem[]`. Removing both is this task (contract change folded with its only consumer). Account button href stays `authRoutes.signIn`.

> **Hard rules:** First screen ready (LCP), p75, phones ≤ 2.5 s · Sideways scrolling at 360 px width: none · the "Public Beta — Free to Use" badge stays
>
> — `spec.md §6 NFR rows 1 + 7, verbatim` + `spec.md §1 clarifications, abridged`

**Fallback:** read [screens.md](../screens.md) SCR-01 and [sad.md](../sad.md) §4–§5. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy path

> **Given** a Visitor who is not signed in
> **When** they open the landing page on a desktop or a phone
> **Then** the main headline says they can get an invoice from one sentence, the line under it says the AI prepares a draft they review before anything is sent, and an account button is visible without scrolling on a 360×640 phone screen and a 1280×800 desktop screen; the first screen no longer shows the row of three figures it shows today
>
> — `spec.md §5, AC-01, verbatim`

### AC-09 — happy path

> **Given** a Visitor using only a keyboard, a screen reader, or a 360×640 phone screen
> **When** they move through the first screen
> **Then** the headline is the page's first heading; the demo has a text equivalent (the example sentence and a summary of the resulting draft) that a screen reader reads; the Replay control, the demo card and the account button can be reached and pressed by keyboard with visible focus; focus is never trapped in the demo; and on the phone the headline, demo and account button fit the screen width without sideways scrolling
>
> — `spec.md §5, AC-09, verbatim` (this task: first heading, account button, 360 px fit; the demo part is T04)

## Checklist

- [ ] Rewrite `components/landing/landing-hero.tsx`: props `{ badge, headline, supportingLine, ctaButton, ctaHref?, demo: LandingDemoSample }`; single `h1`; no `motion` with `opacity: 0` on the headline/button; render `<LandingDemo sample={demo} />` below the button; delete `HeroStat` and the stats markup
- [ ] Remove `stats`, `headline.line1/line2` and the old `subheadline` from `landingContent.hero` (+ the `StatItem` type if now unused) — `constants/public-pages-content.ts`
- [ ] Update the call site in `app/(public)/landing-page.tsx` and exports in `components/landing/index.ts`
- [ ] Reduce hero top/bottom padding so the account button sits above the fold at 360×640 and 1280×800
- [ ] `tests/component/landing-hero.test.tsx`: one `h1` with the headline; supporting line; account link → `authRoutes.signIn`; no stat values ("0%", "100%", "Live") rendered; demo root present

## Edge cases

| Case | Behaviour |
|---|---|
| Long headline at 360 px | wraps, no horizontal overflow |
| Other sections still use `framer-motion` | untouched (only the hero drops the entrance) |

## Definition of Done

- [ ] `tests/component/landing-hero.test.tsx` passes; `tests/unit/landing-claims.test.ts` still passes
- [ ] above-the-fold and 360 px checks are asserted in T09 (not here)
- [ ] `tsc` + lint clean; `pnpm build` succeeds
