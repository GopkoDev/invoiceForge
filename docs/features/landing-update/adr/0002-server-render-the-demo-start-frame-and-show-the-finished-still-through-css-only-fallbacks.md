---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-16"
feature_size: "S"
ticket: "landing-update"
---

# 0002 — Server-render the demo start frame and show the finished still through CSS-only fallbacks

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** Dmytro Hopko (owner), architect — design pass at easy depth

## Context

The Landing demo has three ways to fail to animate that must all end on the same finished still, in the same space (AC-04): the device asks for reduced motion, scripts do not run, or the animation has not started within 3 seconds of the demo becoming visible. When it can animate, it plays once when at least half of it is visible (AC-02). ux-flows left open what the page shows first and how the 3-second fallback is timed. The landing page is server-rendered by Next and hydrated as one client tree (SAD §4).

## Decision drivers

- AC-04: every failure path shows the finished still, and nothing on the page moves.
- Spec §6 NFR: layout shift on the landing page, p75 ≤ 0.1; first screen ready (LCP), p75, phones ≤ 2.5 s.
- AC-02: plays once on visibility, stops on the card, no automatic loop.
- A fallback that itself needs working JavaScript cannot cover "scripts loaded but the player failed".

## Considered options

1. **Start frame in HTML, CSS-only fallbacks** — the server renders the empty chat box; CSS shows the finished still under `<noscript><style>`, under `prefers-reduced-motion: reduce`, and through a 3 s delayed reveal animation that applies only while the demo is in its start frame. The reveal timer runs from page load until the hydrated player marks the demo `armed`; from then on it restarts when the player marks the demo `visible` (≥ 50 % on screen) and is cancelled only when the animation leaves the start frame. The player plays on visibility.
2. **Finished still in HTML** — the server always renders the finished card; when the demo becomes visible the player rewinds to the start and plays.

## Decision outcome

**Chosen:** Option 1. Every fallback works without the player, including when scripts load but the player never runs or takes over and then stalls, and the Visitor never sees the finished card appear, vanish and rebuild on a desktop where the demo is visible at first paint — the "spoiler flash" option 2 accepts in exchange for its simplicity.

## Consequences

**Positive**
- Every AC-04 path ends in a pure-CSS reveal: no-scripts, reduced motion and a player that never takes over need no working JavaScript at all, and a player that takes over then stalls is still caught by the CSS timer it started; reduced motion never animates, even before hydration.
- The demo box is sized by the start frame for every phase, so the still and the animation share one space (CLS).
- The headline, not the demo card, is the first screen's largest content at first paint.

**Negative**
- Before hydration, pure CSS cannot see visibility, so the first timer runs from page load: a demo visible at load on a device that hydrates after 3 s shows the still (within AC-04; Replay plays it once hydrated).
- Three fallback rules plus the `armed`/`visible` attributes are more moving parts than rendering the finished state; the e2e suite must cover each path (no scripts, reduced motion, scripts aborted, player held in `armed`).

**Neutral**
- A late-hydrating player keeps the still when the demo is on screen, so nothing visible moves; when the demo is not yet visible it rewinds unseen and plays on visibility (AC-02).
- Switching to option 2 later is a local change to the demo folder.

## Links

- Spec: [[../spec.md]] AC-02, AC-04, AC-09, §6
- SAD: [[../sad.md]] §4, §6, §8
- Related ADR: [[0001-render-the-landing-demo-card-as-a-standalone-replica-of-the-chat-draft-card]]
