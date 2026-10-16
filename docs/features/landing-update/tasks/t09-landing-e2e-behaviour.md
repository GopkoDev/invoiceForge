---
id: T09
title: "Write the landing e2e spec: first screen, demo timing and fallbacks, no data requests, sign-in links, signed-in redirect"
layer: "tests"
deps: ["T06", "T07", "T08"]
blocks: ["T10"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-08", "AC-09", "AC-10", "AC-11", "AC-12"]
files_hint: ["tests/e2e/landing.spec.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T09 — Write the landing e2e spec: first screen, demo timing and fallbacks, no data requests, sign-in links, signed-in redirect

## Place in the sequence

- **Blocked by:** T06 — hero rewrite, T07 — AI section, T08 — metadata · **Blocks:** T10 — axe + baselines + JS budget · **Wave:** 6.
- **Lane:** shares `tests/e2e/landing.spec.ts` with T10 — serialized.

## Why (user story)

> **As a** Contributor
> **I want** the automated checks of the landing page to cover the new first screen and the AI section
> **So that** a later change cannot silently remove the promise, the demo or the account button
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task writes the browser-level behaviour checks; T10 adds axe, visual references and the JS budget to the same file.

## Inlined context

> automated browser checks in `tests/e2e/landing.spec.ts` for the time from demo visible to `data-phase="done"`, no restart on scroll-back, and no horizontal overflow at 360 px
>
> — `sad.md §10, QG-1 How verify, abridged` · full text: [sad.md](../sad.md)

> automated browser check recording the landing page's requests while the demo plays and replays (fails on any request to `/api/*` or a server action)
>
> — `sad.md §10, QG-2 How verify, verbatim`

> e2e runs with `reducedMotion: 'reduce'`, `javaScriptEnabled: false`, every script request aborted while scripts stay enabled (the 3 s load path), and the player held in `armed` through a test-only start hook (the 3 s visibility path), each asserting the still is visible and the demo box height is unchanged
>
> — `sad.md §10, QG-3 How verify, abridged` — the hook is `globalThis.__LANDING_DEMO_HOLD__` set via `page.addInitScript` (T05).

> | Model calls, or requests that read stored app data, caused by the landing page | 0 (the site-wide page-analytics and performance beacons are excluded) | · | Demo length, start to finished card | ≤ 8 s, plays once, no automatic loop |
>
> — `spec.md §6, NFR rows 5 + 4, verbatim`

> Reference screen sizes for "without scrolling" and the automated checks: phone 360×640, desktop 1280×800.
>
> — `spec.md §1, clarifications, verbatim`

Repo setup: e2e runs against a production build (`tests/e2e/support/start-app-server.mjs`, `APP_E2E_URL`); signed-in helper `openSignedInFreelancer` in `tests/e2e/support/signed-in.ts`; **e2e is not in CI** — run locally before ship, `docker info` first, `caffeinate` long runs.

**Fallback:** read [sad.md](../sad.md) §6 Flows 1–6 and §10, `tests/README.md`. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-01 — happy path
> **Given** a Visitor who is not signed in **When** they open the landing page on a desktop or a phone **Then** the main headline says they can get an invoice from one sentence, the line under it says the AI prepares a draft they review before anything is sent, and an account button is visible without scrolling on a 360×640 phone screen and a 1280×800 desktop screen; the first screen no longer shows the row of three figures it shows today
>
> — `spec.md §5, AC-01, verbatim`

### AC-02 — happy path
> **Given** a Visitor whose device does not ask for reduced motion **When** at least half of the demo becomes visible on screen **Then** the Landing demo plays once per page view: a fixed example sentence appears in a chat box and turns into a draft proposal card showing a Customer, at least one invoice line, the total with its currency and a Create button that the demo does not press, laid out like the in-app chat's draft proposal card; the demo is labelled as an example, stops on that card, and offers a Replay control that plays it again from the start; scrolling away and back does not restart it
>
> — `spec.md §5, AC-02, verbatim`

### AC-03 — authorization
> **Given** a Visitor who is not signed in **When** they watch the Landing demo, replay it, or press anything inside it **Then** the demo shows only its fixed sample content, identical on every play; nothing they do on the landing page reaches the AI chat, creates a Conversation, uses a Daily message allowance or shows any Freelancer's data; and pressing the demo card or its Create button leads to the sign-in page, not to an invoice, at any moment of the demo; pressing Replay only replays the demo
>
> — `spec.md §5, AC-03, verbatim`

### AC-04 — error
> **Given** a Visitor whose device asks for reduced motion, or whose browser cannot play the demo (scripts do not run, or the animation has not started within 3 seconds of the demo becoming visible) **When** the first screen shows **Then** the Visitor sees the demo's finished state as a still picture — the example sentence and the finished proposal card with the same example label — in the same space the animation uses, so nothing on the page moves, and the headline and account button work exactly as in AC-01
>
> — `spec.md §5, AC-04, verbatim`

### AC-08 — happy path
> **Given** a Visitor on the first screen or in the new AI section **When** they press its account button, or (on tablet and desktop) the new navigation link and then the button in the section it jumps to **Then** they reach the sign-in page, where their first sign-in creates their account, exactly as the landing page's existing buttons do
>
> — `spec.md §5, AC-08, verbatim`

### AC-09 — happy path
> **Given** a Visitor using only a keyboard, a screen reader, or a 360×640 phone screen **When** they move through the first screen **Then** the headline is the page's first heading; the demo has a text equivalent (the example sentence and a summary of the resulting draft) that a screen reader reads; the Replay control, the demo card and the account button can be reached and pressed by keyboard with visible focus; focus is never trapped in the demo; and on the phone the headline, demo and account button fit the screen width without sideways scrolling
>
> — `spec.md §5, AC-09, verbatim` (axe part is T10)

### AC-10 — cross-context
> **Given** a Freelancer who is signed in **When** they open the landing page address **Then** they are taken to their dashboard, as today, and never see the new first screen or AI section
>
> — `spec.md §5, AC-10, verbatim`

### AC-11 — happy path
> **Given** the new first screen and the new AI section **When** the landing page's automated checks run **Then** they fail if the headline, the demo's finished card, the AI section or the account button is missing, or if the landing page shows sideways scrolling on a phone; and the landing page's visual references are refreshed to the new design, showing the demo's finished state in light and dark theme on the phone and desktop reference screens
>
> — `spec.md §5, AC-11, verbatim` (this task: presence + no-overflow; visual references are T10)

### AC-12 — happy path
> **Given** a search engine result or a link preview of the landing page **When** a Visitor sees it before visiting **Then** its description mentions getting an invoice draft from one sentence with AI
>
> — `spec.md §5, AC-12, verbatim`

## Checklist

- [ ] `tests/e2e/landing.spec.ts`, projects at 360×640 and 1280×800: h1 text + supporting line; account link in viewport without scroll; no "0%"/"100%"/"Live" stats; `scrollWidth <= clientWidth`
- [ ] Demo: scroll into view → `data-phase="done"` within 8 s of visible; scroll away/back → stays `done`; Replay → passes through `idle` and back to `done` with identical text
- [ ] Requests: record `page.on('request')` across load + play + replay; fail on `/api/*`, `next-action` header, or any non-beacon request after load
- [ ] Links: card and Create → `/login` (at `typing` and at `done`); AI-section button and nav `AI` → `#ai` → button → `/login` (desktop); privacy link → `/privacy`
- [ ] Fallbacks (each asserts still visible + demo box height equal to the normal run): `reducedMotion: 'reduce'`; `javaScriptEnabled: false`; `page.route('**/*.js', abort)` (wait > 3 s); `addInitScript` hold flag (wait > 3 s after visible)
- [ ] Keyboard: Tab order reaches account button → demo card → Create → Replay with visible focus, then leaves the demo
- [ ] Signed-in: `openSignedInFreelancer` then `goto('/')` → dashboard URL, no `#ai`
- [ ] Metadata: `meta[name=description]`, `og:description`, `twitter:description` mention one sentence + AI

## Edge cases

| Case | Behaviour |
|---|---|
| Docker down / Mac asleep | not a product red — check `docker info`, re-run with `caffeinate` |
| Vercel analytics / speed-insights beacons | excluded from the request check |
| Demo already visible at load on desktop | timing starts at load-visible |

## Definition of Done

- [ ] `pnpm test:e2e tests/e2e/landing.spec.ts` green locally against a production build (output quoted in the commit/PR)
- [ ] removing the h1, the demo card, `#ai` or the account button makes the spec fail (checked once by hand)
- [ ] `tsc` + lint clean
