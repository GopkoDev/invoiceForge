---
id: T46
title: "E2E: dark-theme greeting contrast check, phone-width start panel overflow check, data-slot selectors (review R16-4, R16-10, R16-11)"
layer: "tests"
deps: ["T43", "T45"]
blocks: []
acs: ["AC-15", "AC-18"]
files_hint: ["tests/e2e/accessibility.spec.ts", "tests/e2e/ai-chat-v2-chat.spec.ts", "tests/e2e/ai-assistant-flows.spec.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T46 — E2E: dark-theme greeting contrast check, phone-width start panel overflow check, data-slot selectors (review R16-4, R16-10, R16-11)

Follow-up task from review 2026-10-13, round 16, which reviewed the presentation rewrite. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

(R16-4) T37's DoD asks for no greeting contrast violation in light and in dark, but nothing runs dark, and axe marks gradient text as incomplete. (R16-10) No phone-width overflow check covers the start panel. (R16-11) The selectors `:scope > div` and `h1 > span` depend on DOM nesting.

## Definition of Done

- RED first: accessibility.spec runs the empty-state axe scan in the dark theme too, and the greeting accent's contrast is asserted by computing the token colours (axe reports gradient text as incomplete); a 360x640 check asserts the start panel has no horizontal overflow; the centred-column and greeting-mask selectors use data-slot instead of DOM nesting; affected e2e specs pass.
- Gate: unit (only the 8 known env.example failures), affected integration, lint and typecheck green. Commit with `SDD-Task: T46`.
