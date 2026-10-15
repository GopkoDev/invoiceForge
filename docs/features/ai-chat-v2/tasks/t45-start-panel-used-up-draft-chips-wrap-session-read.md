---
id: T45
title: "Start panel: used-up from Create with AI keeps the default heading, chips wrap on phones, greeting slot, one session read (review R16-3, R16-9, R16-10)"
layer: "ui"
deps: ["T37"]
blocks: []
acs: ["AC-18", "AC-30"]
files_hint: ["components/ai/start-panel.tsx", "components/ai-elements/suggestion.tsx", "lib/helpers/account-name.ts", "app/(protected)/ai/page.tsx", "tests/component/ai-start-panel.test.tsx", "tests/component/ai-elements-prompt-input.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T45 — Start panel: used-up from Create with AI keeps the default heading, chips wrap on phones, greeting slot, one session read (review R16-3, R16-9, R16-10)

Follow-up task from review 2026-10-13, round 16, which reviewed the presentation rewrite. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

(R16-3) `?start=draft` with `left = 0` shows "Let's draft an invoice." and the draft sub-line above a used-up notice, but the wireframe (screens.md:187-196) shows the default line 2. (R16-10) The suggestion chips are `whitespace-nowrap`, so the longest one probably overflows 375–390 px phones. (R16-9) `sessionAccountName()` calls `auth()` again, which adds one more user lookup per render. (R16-11, part) The e2e greeting mask selects `h1 > span`.

## Definition of Done

- RED first: With start=draft and left=0 the start panel shows the default line 2 and no draft sub-line (test asserts heading and absence of sub-line); Suggestion chips may wrap their text (no whitespace-nowrap overflow at 360 px); the greeting line carries data-slot="greeting-line"; the /ai page reads the account name without an extra auth() call per render; tests written first.
- Gate: unit (only the 8 known env.example failures), affected integration, lint and typecheck green. Commit with `SDD-Task: T45`.
