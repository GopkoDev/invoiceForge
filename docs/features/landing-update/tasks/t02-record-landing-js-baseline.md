---
id: T02
title: "Record the landing page's first-load compressed JavaScript baseline before any landing code changes"
layer: "tests"
deps: []
blocks: ["T06", "T07", "T10"]
acs: []
files_hint: ["tests/e2e/support/landing-js-size.ts", "tests/e2e/support/landing-js-baseline.json", "scripts/measure-landing-js.mjs"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T02 — Record the landing page's first-load compressed JavaScript baseline before any landing code changes

## Place in the sequence

- **Blocked by:** — · **Blocks:** T06 — hero rewrite, T07 — AI section, T10 — axe + baselines + JS budget · **Wave:** 1 — it **must** run while `/` is still the old page; T06/T07 are the first tasks that change the landing bundle.
- **Lane:** own lane. Serves the NFR only (no §5 AC).

## Why (user story)

> **As a** Contributor
> **I want** the automated checks of the landing page to cover the new first screen and the AI section
> **So that** a later change cannot silently remove the promise, the demo or the account button
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task captures the "before" number the ≤ 30 KB budget is measured against.

## Inlined context

> | Code added to the landing page's first load by the demo | ≤ 30 KB compressed | production build output, landing page first-load size before vs after |
>
> — `spec.md §6, NFR row 3, verbatim`

> first-load size measured as the compressed JavaScript the landing page transfers on load from the production build, before vs after (Next 16's build output no longer prints first-load size)
>
> — `sad.md §10, QG-1 How verify, verbatim` · full text: [sad.md](../sad.md)

> | The 30 KB budget has no build-output number in Next 16 | Low | Measured as transferred compressed JS on `/` from the production build in e2e, against a baseline recorded before the change |
>
> — `sad.md §11, risk row 5, verbatim`

e2e runs against a production build (`tests/e2e/support/start-app-server.mjs`); e2e is not in CI — run locally (`docker info` first; caffeinate long runs).

**Fallback:** read [sad.md](../sad.md) §10–§11 and `tests/README.md`. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

No §5 AC — this task serves spec §6 NFR "Code added to the landing page's first load by the demo ≤ 30 KB compressed" (quoted above, `spec.md §6, verbatim`); T10 turns it into an asserting check.

## Checklist

- [ ] Write a reusable measurer `tests/e2e/support/landing-js-size.ts`: open `/` as an anonymous Visitor in Playwright, wait for `load` + network idle, sum the **encoded (transfer) size** of every `script` response from the app origin (exclude Vercel analytics / speed-insights beacons)
- [ ] Add `scripts/measure-landing-js.mjs` (or a `--grep @baseline` Playwright test) that runs the measurer against the production build and writes `tests/e2e/support/landing-js-baseline.json` `{ commit, measuredAt, bytes }`
- [ ] Run it on the current (pre-change) HEAD and commit the JSON

## Edge cases

| Case | Behaviour |
|---|---|
| Responses served from cache (encoded size 0) | measure in a fresh context with cache disabled |
| Measured from a dev server | refused — production build only |

## Definition of Done

- [ ] `tests/e2e/support/landing-js-baseline.json` committed with the pre-change commit sha and a non-zero byte count
- [ ] the measurer is importable by T10's e2e budget check
- [ ] `tsc` + lint clean
