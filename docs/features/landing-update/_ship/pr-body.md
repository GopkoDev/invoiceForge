## Summary

The landing page now leads with the one-sentence promise and shows it happen. The first screen says "Your next invoice is one sentence away". On desktop the promise sits on the left and a Landing demo on the right. The demo is drawn as an AI chat window: it types an example sentence, sends it, and shows a draft proposal card whose Create button is never pressed. A new AI section right after the first screen states what the AI does and never does, and names the AI tools that can connect today. The demo calls no model and reads no data. This is a temporary bridge until public-redesign.

Spec: [`docs/features/landing-update/spec.md`](docs/features/landing-update/spec.md). Changelog: [`_ship/changelog.md`](docs/features/landing-update/_ship/changelog.md). Review: [`_review/review-2026-10-17.md`](docs/features/landing-update/_review/review-2026-10-17.md) (PASS, F1–F10 fixed).

> **Post-review redesign.** After the review PASS, the owner asked for a better-looking demo. `e2568b44` redraws it as an app window: a title bar with the Example badge, the sentence typed into the message box and sent as a bubble, an assistant row with thinking dots and a one-line reply, and card rows that rise in turn. It also puts the hero in two columns on desktop. The player logic, phases, timings, box-size rule, CSS-only fallbacks, Replay and sign-in links are unchanged. It adds four copy fields to `landingContent`, all covered by the claims guard. The clean-context reviewer did not re-review this commit. All landing unit, component and e2e checks pass on it, and the Linux baselines were re-taken (`a930244f`).

## Acceptance criteria

- AC-01: promise, supporting line and account button above the fold on 360×640 and 1280×800; no stats row ✓
- AC-02: the demo plays once at 50 % visible, finishes in 4.6 s, does not restart on scroll-back, and Replay plays it again ✓
- AC-03: fixed sample content only; the window and Create lead to sign-in in every phase; Replay only replays ✓
- AC-04: the finished picture shows for reduced motion, without scripts, and after 3 s without a start; same box ✓
- AC-05: no text says the AI issues, sends, edits or creates a Customer, and nothing promises unlimited AI use ✓
- AC-06: the AI section after the first screen, with its limits, the privacy link and its own account button ✓
- AC-07: names exactly Claude Desktop, Claude Code and Cursor; states the draft permission; the technical name appears at most once, in small print ✓
- AC-08: the account buttons and the AI navigation link lead to sign-in ✓
- AC-09: the h1 comes first, the demo has a text equivalent, keyboard focus is visible and never trapped, and there is no sideways scroll at 360 px ✓
- AC-10: a signed-in Freelancer is redirected to the dashboard ✓
- AC-11: automated checks plus refreshed Linux visual references (light and dark, phone and desktop) ✓
- AC-12: the description, og and twitter text mention an invoice draft from one sentence with AI ✓

## Design

- Spec: `docs/features/landing-update/spec.md`
- Architecture: `docs/features/landing-update/sad.md`
- Decisions: `docs/features/landing-update/adr/` (ADR-0001 demo card replica, ADR-0002 server-rendered start frame + CSS-only fallbacks)
- Screens: `docs/features/landing-update/screens.md`
- Data model / API: none. No datastore, route handler or server action (sad.md §2).

## Tasks (SDD-Task trailers)

- T01 `1fd953e8`: landing copy, demo sample, claims truth guard
- T02 `ea8bdd8e`, `f5c4ac94`: first-load JS baseline; preview-deploy guard
- T03 `0dd14755`: DemoDraftCard replica
- T04 `cb7be9d6`: LandingDemo player
- T05 `3b645332`, `d2f85cf2`: finished-still fallbacks and reveal timing
- T06 `7931556a`: LandingHero around the promise and demo
- T07 `5b9529bd`: AiSection and the `#ai` navigation link
- T08 `a6874ef6`: landing metadata
- T09 `d8ddf059`: landing e2e spec
- T10 `0d10570b`, `76dd0220`: axe, Linux visual references, JS budget
- T11 `634a59f2`: design-system inventory
- T12–T16 `5818ea7f`, `11a83dfa`, `9f7e7450`, `8f9e0032`, `78df10a7`, `2fe1ba15`: review fixes F1–F10
- Post-review: `e2568b44` app-window demo and two-column hero; `a930244f` Linux baselines re-taken

## Verification

- Unit: `pnpm test` 3574/3574 ✓
- Integration: `pnpm test:integration` 1632 passed, 61 skipped ✓
- Lint + typecheck: `pnpm lint` 0 errors (6 old warnings); `tsc --noEmit` clean ✓
- e2e: full local `CI=1 pnpm test:e2e` 192 passed, 12 skipped, 0 failed (9.0 min) ✓. Landing spec on the host: 33 passed, 5 skipped (Linux-only baselines). The 4 Linux baselines matched in `mcr.microsoft.com/playwright:v1.63.0-noble` twice without `--update-snapshots`.
- JS budget: the demo adds 3.9 KB of the allowed 30 KB of compressed first-load JS.
- Ran the feature: signed out on the dev server with a browser script:
  - AC-01: at 360×640 the h1 is the promise and the account button is inside the viewport. There is no stats row and no sideways scroll (scrollWidth 360).
  - AC-02: the demo went from typing to the finished card in 4.8 s, and Replay showed up.
  - AC-03: play plus Replay sent no non-GET request and no `/api` request. Replay kept the URL at `/`. Pressing Create while the sentence was still typing went to `/login`.
  - AC-04: with reduced motion the demo opened in `still` with the bubble at full opacity and no Replay.

## Operational notes

- Migration: none.
- Feature flag / config: none.
- Rollback: revert the merge and redeploy; no stored state.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
