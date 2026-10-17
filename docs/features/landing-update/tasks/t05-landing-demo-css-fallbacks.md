---
id: T05
title: "Add the demo's CSS-only finished-still fallbacks and the armed/visible reveal timing"
layer: "ui"
deps: ["T04"]
blocks: ["T06", "T11"]
acs: ["AC-04"]
files_hint: ["components/landing/landing-demo/landing-demo.tsx", "components/landing/landing-demo/landing-demo.module.css", "tests/component/landing-demo.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T05 — Add the demo's CSS-only finished-still fallbacks and the armed/visible reveal timing

## Place in the sequence

- **Blocked by:** T04 — demo player · **Blocks:** T06 — hero rewrite (embeds the finished demo), T11 — design-system registration · **Wave:** 4.
- **Lane:** shares the `landing-demo/` files and `tests/component/landing-demo.test.tsx` with T04 — serialized.

## Why (user story)

> **As a** Visitor who uses a phone, a keyboard, a screen reader, or a setting that reduces motion
> **I want** the promise, the demo and the account button to work for me
> **So that** I get the same message as everyone else
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task makes every non-animating path end on the finished still, in the same box.

## Inlined context

> **Start frame in HTML, CSS-only fallbacks** — the server renders the empty chat box; CSS shows the finished still under `<noscript><style>`, under `prefers-reduced-motion: reduce`, and through a 3 s delayed reveal animation that applies only while the demo is in its start frame. The reveal timer runs from page load until the hydrated player marks the demo `armed`; from then on it restarts when the player marks the demo `visible` (≥ 50 % on screen) and is cancelled only when the animation leaves the start frame. The player plays on visibility.
>
> — `adr/0002, Considered options 1 (chosen), verbatim` · full text: [ADR-0002](../adr/0002-server-render-the-demo-start-frame-and-show-the-finished-still-through-css-only-fallbacks.md)

> A player that hydrates after the load reveal fired keeps the still only if the demo is on screen; if it is not yet visible, it rewinds unseen to the start frame and plays on visibility (AC-02).
>
> — `sad.md §4, choice 4, verbatim`

> alt scripts do not run → noscript style shows the finished still · else reduced motion → media query shows the finished still; Demo hydrates, stays on the still, never animates · else player has not taken over within 3 s of load → delayed CSS reveal shows the finished still; Demo hydrates late, keeps the still if on screen, else rewinds unseen · else player took over but the animation has not started 3 s after the demo became visible → visibility-started CSS reveal shows the finished still · Note: the still uses the same box, nothing moves
>
> — `sad.md §6, Critical flow 2, abridged`

> | error (still) | … the finished state shown without animation in the same box — sentence + finished card + "Example" label. Replay shown only when the player is hydrated and reduced motion is not asked (with no scripts or under reduced motion there is nothing to replay) |
>
> — `screens.md SCR-01, state error (still), abridged`

> e2e runs with … the player held in `armed` through a test-only start hook (the 3 s visibility path)
>
> — `sad.md §10, QG-3, abridged` — this task provides that hook: e.g. the player skips starting when `globalThis.__LANDING_DEMO_HOLD__ === true` (set only by Playwright `addInitScript`); inert in production, commented in the file.

> **Hard rule:** layout shift on the landing page, p75 ≤ 0.1 — the demo box is sized by the start frame for every phase, so the still and the animation share one space
>
> — `spec.md §6 NFR row 2` + `adr/0002 Consequences, abridged`

CSP already allows inline styles (`next.config.ts:8-9`) — `<noscript><style>` needs no CSP change (`sad.md §2`).

**Fallback:** read [ADR-0002](../adr/0002-server-render-the-demo-start-frame-and-show-the-finished-still-through-css-only-fallbacks.md) and [sad.md](../sad.md) §4/§6/§8. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-04 — error

> **Given** a Visitor whose device asks for reduced motion, or whose browser cannot play the demo (scripts do not run, or the animation has not started within 3 seconds of the demo becoming visible)
> **When** the first screen shows
> **Then** the Visitor sees the demo's finished state as a still picture — the example sentence and the finished proposal card with the same example label — in the same space the animation uses, so nothing on the page moves, and the headline and account button work exactly as in AC-01
>
> — `spec.md §5, AC-04, verbatim`

## Checklist

- [ ] CSS module: `.still` rules shared by (a) `@media (prefers-reduced-motion: reduce)`, (b) a `<noscript><style>` block rendered by the component, (c) a 3 s `animation-delay` reveal keyed on `[data-phase="idle"]:not([data-armed])` (load timer) and `[data-phase="idle"][data-armed][data-visible]` (visibility timer); leaving `idle` cancels it
- [ ] Player on mount: set `data-armed`; under `matchMedia('(prefers-reduced-motion: reduce)')` set `data-phase="still"` and never animate (no Replay)
- [ ] Late hydration: if the load reveal already fired (≥ 3 s since `performance.timeOrigin`) and the demo is on screen → `still` + Replay; not on screen → stay `idle`, play on visibility
- [ ] On ≥ 50 % visible set `data-visible` before starting; honour the test hold flag
- [ ] Extend `tests/component/landing-demo.test.tsx`: reduced motion → `still`, no timers, no Replay; late-hydration on/off-screen branches; `data-armed`/`data-visible` set in order; hold flag keeps `idle` + `armed`
- [ ] Confirm the box height is identical in `idle`, `done` and `still` (same CSS class sizes the box)

## Edge cases

| Case | Behaviour |
|---|---|
| Reduced motion + Replay | Replay hidden — nothing to replay |
| Scripts off | finished still via `<noscript>`; no Replay; links still work (plain anchors in HTML) |
| Player armed, stalls before `typing` | visibility-started reveal shows the still 3 s after visible |
| Still shown, then player starts (late) while on screen | keeps the still — nothing visible moves |

## Definition of Done

- [ ] `tests/component/landing-demo.test.tsx` passes incl. the new AC-04 branches (browser-level CSS paths are asserted in T09)
- [ ] no phase or fallback changes the demo box size
- [ ] `tsc` + lint clean
