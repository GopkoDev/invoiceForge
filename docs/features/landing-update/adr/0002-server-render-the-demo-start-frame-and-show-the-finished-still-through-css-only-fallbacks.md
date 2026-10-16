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

1. **Start frame in HTML, CSS-only fallbacks** — the server renders the empty chat box; CSS shows the finished still under `<noscript><style>`, under `prefers-reduced-motion: reduce`, and through a 3 s delayed reveal animation; the hydrated player marks takeover (cancelling the reveal) and plays on visibility.
2. **Finished still in HTML** — the server always renders the finished card; when the demo becomes visible the player rewinds to the start and plays.

## Decision outcome

**Chosen:** Option 1. Every fallback works without the player, including when scripts load but the player never runs, and the Visitor never sees the finished card appear, vanish and rebuild on a desktop where the demo is visible at first paint — the "spoiler flash" option 2 accepts in exchange for its simplicity.

## Consequences

**Positive**
- All three AC-04 paths are pure CSS and need no working JavaScript; reduced motion never animates, even before hydration.
- The demo box is sized by the start frame for every phase, so the still and the animation share one space (CLS).
- The headline, not the demo card, is the first screen's largest content at first paint.

**Negative**
- The 3 s CSS timer starts at page load, not at visibility; on a slow phone where hydration takes longer than 3 s, the Visitor gets the still instead of the animation (Replay can still play it once hydrated).
- Three fallback rules plus a takeover class are more moving parts than rendering the finished state; the e2e suite must cover each path (no scripts, reduced motion, scripts aborted).

**Neutral**
- A late-hydrating player keeps the still rather than rewinding, so nothing moves after the reveal.
- Switching to option 2 later is a local change to the demo folder.

## Links

- Spec: [[../spec.md]] AC-02, AC-04, AC-09, §6
- SAD: [[../sad.md]] §4, §6, §8
- Related ADR: [[0001-render-the-landing-demo-card-as-a-standalone-replica-of-the-chat-draft-card]]
