---
id: T10
title: "Add axe, Linux visual references of the finished demo (light/dark, phone/desktop) and the 30 KB JS budget check to the landing e2e spec"
layer: "tests"
deps: ["T02", "T09"]
blocks: []
acs: ["AC-09", "AC-11"]
files_hint: ["tests/e2e/landing.spec.ts", "tests/e2e/landing.spec.ts-snapshots/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Add axe, Linux visual references of the finished demo and the 30 KB JS budget check to the landing e2e spec

## Place in the sequence

- **Blocked by:** T02 — JS baseline, T09 — landing e2e behaviour · **Blocks:** — · **Wave:** 7 (last).
- **Lane:** shares `tests/e2e/landing.spec.ts` with T09 — serialized.

## Why (user story)

> **As a** Contributor
> **I want** the automated checks of the landing page to cover the new first screen and the AI section
> **So that** a later change cannot silently remove the promise, the demo or the account button
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task adds the accessibility gate, the visual references and the bundle budget.

## Inlined context

> the repo's axe harness (`@axe-core/playwright`) run against `/` inside `tests/e2e/landing.spec.ts` at phone and desktop width · Linux visual baselines of the finished state in light and dark at 360×640 and 1280×800 (AC-11)
>
> — `sad.md §10, QG-3 How verify, abridged` · full text: [sad.md](../sad.md)

> | Accessibility violations on the landing page (serious or critical) | 0 | existing automated accessibility check run against the landing page | · | Code added to the landing page's first load by the demo | ≤ 30 KB compressed | production build output, landing page first-load size before vs after |
>
> — `spec.md §6, NFR rows 6 + 3, verbatim`

> Measured as transferred compressed JS on `/` from the production build in e2e, against a baseline recorded before the change
>
> — `sad.md §11, risk row 5, abridged` — baseline = `tests/e2e/support/landing-js-baseline.json`, measurer = `tests/e2e/support/landing-js-size.ts` (T02).

Repo conventions: axe pattern in `tests/e2e/accessibility.spec.ts` (serious/critical fail, moderate/minor annotate; gradient text is reported "incomplete"); Playwright baselines are **Linux-named** (`*-chromium-linux.png`) — generate them in the Linux container, not on macOS; no baselines cover `/` today. Snapshot the finished state via `data-phase="done"` (or the reduced-motion still) so the shot is deterministic.

**Fallback:** read [sad.md](../sad.md) §10–§11, `tests/README.md`, `tests/e2e/accessibility.spec.ts`. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-09 — happy path

> **Given** a Visitor using only a keyboard, a screen reader, or a 360×640 phone screen
> **When** they move through the first screen
> **Then** the headline is the page's first heading; the demo has a text equivalent (the example sentence and a summary of the resulting draft) that a screen reader reads; the Replay control, the demo card and the account button can be reached and pressed by keyboard with visible focus; focus is never trapped in the demo; and on the phone the headline, demo and account button fit the screen width without sideways scrolling
>
> — `spec.md §5, AC-09, verbatim` (this task: the axe gate)

### AC-11 — happy path

> **Given** the new first screen and the new AI section
> **When** the landing page's automated checks run
> **Then** they fail if the headline, the demo's finished card, the AI section or the account button is missing, or if the landing page shows sideways scrolling on a phone; and the landing page's visual references are refreshed to the new design, showing the demo's finished state in light and dark theme on the phone and desktop reference screens
>
> — `spec.md §5, AC-11, verbatim` (this task: visual references)

## Checklist

- [ ] axe on `/` at 360×640 and 1280×800 (light + dark), `withTags(['wcag2a','wcag2aa'])`, fail on serious/critical — `tests/e2e/landing.spec.ts`
- [ ] Visual references: first screen with demo at `done`, light + dark × phone + desktop → 4 `landing-*-chromium-linux.png` under `tests/e2e/landing.spec.ts-snapshots/`, generated in the Linux container
- [ ] JS budget: import the T02 measurer, assert `now − baseline.bytes ≤ 30 * 1024`; on fail print both numbers
- [ ] Run the full e2e suite once (not only this file) to catch other specs that relied on the old hero copy

## Edge cases

| Case | Behaviour |
|---|---|
| Container `next build` font-fetch flake | retry, then clean leaked Postgres containers |
| Gradient headline text reported "incomplete" by axe | not a failure; measure contrast as the repo does if the hero keeps a gradient |
| Baselines generated on macOS | rejected — Linux names only |

## Definition of Done

- [ ] `pnpm test:e2e tests/e2e/landing.spec.ts` green locally with 4 committed Linux baselines, 0 serious/critical axe findings and the JS delta printed ≤ 30 KB
- [ ] full local e2e suite green (or every red explained as environment, per repo memory)
- [ ] lint clean
