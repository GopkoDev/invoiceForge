---
id: T04
title: "Build the LandingDemo player: phase state machine, play-once on visibility, Replay, links and text equivalent"
layer: "ui"
deps: ["T01", "T03"]
blocks: ["T05"]
acs: ["AC-02", "AC-03", "AC-09"]
files_hint: ["components/landing/landing-demo/landing-demo.tsx", "components/landing/landing-demo/landing-demo.module.css", "tests/component/landing-demo.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T04 — Build the LandingDemo player: phase state machine, play-once on visibility, Replay, links and text equivalent

## Place in the sequence

- **Blocked by:** T01 — landing content, T03 — DemoDraftCard · **Blocks:** T05 — CSS fallbacks · **Wave:** 3.
- **Lane:** shares `landing-demo.tsx` / `landing-demo.module.css` / `tests/component/landing-demo.test.tsx` with T05 — serialized. This task builds the animated happy path; T05 adds the still and the `armed`/`visible` reveal.

## Why (user story)

> **As a** Visitor
> **I want** to see an example sentence turn into an invoice draft without signing up
> **So that** I believe the promise instead of taking it on trust
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Visitor who uses a phone, a keyboard, a screen reader, or a setting that reduces motion
> **I want** the promise, the demo and the account button to work for me
> **So that** I get the same message as everyone else
>
> — `spec.md §4, US-06, verbatim`

This task makes the demo play, replay and stay usable by keyboard and screen reader.

## Inlined context

> **Animation engine:** CSS transitions keyed by a `data-phase` attribute (`idle → typing → thinking → card → done`, plus `still`) that a small client state machine advances on timers; no new dependency and no `framer-motion` in the demo. The phase attribute is also the test hook (AC-02 timing, AC-11 finished card).
>
> — `sad.md §4, supporting choices, verbatim` · full text: [sad.md](../sad.md)

> `landing-demo.tsx` — `'use client'` player: phase state machine, IntersectionObserver (≥ 0.5), play-once per page view, Replay, `armed`/`visible` attributes that drive the CSS reveal (ADR-0002) · `landing-demo.module.css` — fixed-size box, per-phase rules
>
> — `sad.md §5, internal decomposition, abridged`

> Demo->>Demo: waits until at least half of the demo is visible / plays once: typing, thinking, card, done / finished proposal card, Create unpressed, Replay shown · alt Visitor presses Replay: restarts from the start frame, same fixed content · else presses the card or Create: follows the link [to sign-in] · else scrolls away and back: stays on done, no restart
>
> — `sad.md §6, Critical flow 1, abridged`

> the demo's decorative animated layer (typing, thinking, card visuals) is `aria-hidden` and contains no focusable element; a visually hidden text equivalent reads the example sentence and the draft summary; the card link and the Create link are two separate, non-nested links placed outside the `aria-hidden` layer (overlaid on the card), so they stay reachable at every phase; card, Create, Replay and account button are native links/buttons with visible focus and no focus trap; phase changes are not announced
>
> — `sad.md §8, Accessibility, verbatim`

> Every new action is a plain link to `authRoutes.signIn` (account buttons, demo card, Create) or an in-page anchor (`#ai`); Replay is the only button and only replays
>
> — `sad.md §8, Navigation targets, verbatim`

> | replaying | Visitor presses Replay: demo returns to `idle` and plays again from the start with identical content; focus stays on Replay | · Tab order: … demo card → Create → Replay; … the chat box is inert, not focusable
>
> — `screens.md SCR-01, states replaying + keyboard, abridged` · wireframes C/D in [screens.md](../screens.md)

> **Hard rules:** | Demo length, start to finished card | ≤ 8 s, plays once, no automatic loop | · the player performs no fetch · the demo box has a fixed size per breakpoint from the start frame; … no phase changes the page height
>
> — `spec.md §6 NFR row 4, verbatim` + `sad.md §10 QG-2` + `sad.md §8 Layout stability, abridged`

**Fallback:** read [sad.md](../sad.md) §4–§8 and [ADR-0002](../adr/0002-server-render-the-demo-start-frame-and-show-the-finished-still-through-css-only-fallbacks.md). Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-02 — happy path

> **Given** a Visitor whose device does not ask for reduced motion
> **When** at least half of the demo becomes visible on screen
> **Then** the Landing demo plays once per page view: a fixed example sentence appears in a chat box and turns into a draft proposal card showing a Customer, at least one invoice line, the total with its currency and a Create button that the demo does not press, laid out like the in-app chat's draft proposal card; the demo is labelled as an example, stops on that card, and offers a Replay control that plays it again from the start; scrolling away and back does not restart it
>
> — `spec.md §5, AC-02, verbatim`

### AC-03 — authorization

> **Given** a Visitor who is not signed in
> **When** they watch the Landing demo, replay it, or press anything inside it
> **Then** the demo shows only its fixed sample content, identical on every play; nothing they do on the landing page reaches the AI chat, creates a Conversation, uses a Daily message allowance or shows any Freelancer's data; and pressing the demo card or its Create button leads to the sign-in page, not to an invoice, at any moment of the demo; pressing Replay only replays the demo
>
> — `spec.md §5, AC-03, verbatim`

### AC-09 — happy path

> **Given** a Visitor using only a keyboard, a screen reader, or a 360×640 phone screen
> **When** they move through the first screen
> **Then** the headline is the page's first heading; the demo has a text equivalent (the example sentence and a summary of the resulting draft) that a screen reader reads; the Replay control, the demo card and the account button can be reached and pressed by keyboard with visible focus; focus is never trapped in the demo; and on the phone the headline, demo and account button fit the screen width without sideways scrolling
>
> — `spec.md §5, AC-09, verbatim` (this task: the demo's part; headline/account button are T06)

## Checklist

- [ ] `landing-demo.tsx` (`'use client'`): props `sample: LandingDemoSample`; phases `idle → typing → thinking → card → done` on `setTimeout`s (total ≤ 8 s); `data-phase` on the root; IntersectionObserver `threshold: 0.5` starts play once (`hasPlayed` ref), then disconnects
- [ ] Replay `<button type="button">` shown at `done`; resets to `idle` and replays; focus stays on it; clears pending timers
- [ ] Decorative layer `aria-hidden="true"` (user bubble typing, thinking dots, inert chat box, `DemoDraftCard`); sr-only text from `sample.srSummary`
- [ ] Two sibling `next/link`s to `authRoutes.signIn` overlaid on the card area (card, Create) outside the `aria-hidden` layer, present in every phase, visible focus ring
- [ ] `landing-demo.module.css`: fixed box size per breakpoint, per-phase visibility/transition rules; no width overflow at 360 px
- [ ] `tests/component/landing-demo.test.tsx` (fake timers + mocked IntersectionObserver; block-body `beforeEach`): plays only at ≥ 0.5; reaches `done` ≤ 8 s; no restart on second intersection; Replay replays with identical text; card/Create hrefs = `authRoutes.signIn`; no `fetch` called (spy); sr text present; no focusable inside `aria-hidden`

## Edge cases

| Case | Behaviour |
|---|---|
| Replay pressed mid-animation (only shown at `done`) | not reachable — Replay renders only at `done` |
| Unmount mid-play | all timers cleared, observer disconnected |
| Visible at 49 % | does not start |
| Card / Create pressed during `typing` | still navigates to sign-in (links exist in every phase) |

## Definition of Done

- [ ] `tests/component/landing-demo.test.tsx` passes for every AC-02/AC-03/AC-09 assertion listed above
- [ ] no new dependency; no `framer-motion` import in `components/landing/landing-demo/`
- [ ] `tsc` + lint clean
