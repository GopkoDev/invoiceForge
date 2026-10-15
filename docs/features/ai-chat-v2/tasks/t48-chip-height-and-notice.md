---
id: T48
title: "One-line suggestion chips keep 32 px; NOTICE records the T44/T45 changes (review R17-2, R17-3)"
layer: "ui"
deps: ["T45"]
blocks: []
acs: ["AC-18"]
files_hint: ["components/ai-elements/suggestion.tsx", "components/ai-elements/NOTICE", "tests/component/ai-elements-prompt-input.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T48 — One-line suggestion chips keep 32 px; NOTICE records the T44/T45 changes (review R17-2, R17-3)

Follow-up task from review 2026-10-13, round 17. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

`py-1.5` made the chips 34 px tall, against 32 px before, which would shift the SCR-02 baselines. The NOTICE still describes the submit Loader and leaves out the InputGroup card and chip wrapping.

## Definition of Done

- RED first: A one-line Suggestion chip is 32 px tall again (py-1 with min-h-8), wrapped chips still grow; components/ai-elements/NOTICE lists the InputGroup card, the decorative submit spinner and chip text wrapping; Linux baselines checked.
- Gate: unit (only the 8 known env.example failures), lint and typecheck green. Commit with `SDD-Task: T48`.
