---
id: T44
title: "PromptInput on InputGroup, IME-safe Enter in Safari, and a decorative spinner in the submit (review R16-5, R16-6, R16-7)"
layer: "ui"
deps: ["T34"]
blocks: []
acs: ["AC-18", "AC-33"]
files_hint: ["components/ai-elements/prompt-input.tsx", "components/ai-elements/loader.tsx", "tests/component/ai-elements-prompt-input.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T44 — PromptInput on InputGroup, IME-safe Enter in Safari, and a decorative spinner in the submit (review R16-5, R16-6, R16-7)

Follow-up task from review 2026-10-13, round 16, which reviewed the presentation rewrite. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

(R16-5) When busy, the submit renders `Loader`. That is a `<div>` inside a `<button>`, with a second `role="status"` "Loading" that duplicates "Assistant is replying…". (R16-6) In WebKit, the Enter that confirms an IME arrives after `compositionend`, with `keyCode 229` and `isComposing=false`, so it submits. (R16-7) The card hand-copies InputGroup's styling and uses `InputGroupTextarea` with no `InputGroup` parent.

## Definition of Done

- RED first: PromptInput's card is the InputGroup primitive (no hand-copied border, ring or invalid classes); an Enter keydown with keyCode 229 (Safari, after compositionend) does not submit; PromptInputSubmit's busy state is a decorative aria-hidden spinner with no role=status and no div inside the button, so only the chat's own status announces a waiting reply; component tests written first prove each.
- Gate: unit (only the 8 known env.example failures), affected integration, lint and typecheck green. Commit with `SDD-Task: T44`.
