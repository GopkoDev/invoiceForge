---
id: T107
title: "Docs describe the bounds as they are, with the estimate marked and exclusions named (N-2 docs, N-3, N-4)"
layer: "docs"
deps: ["T106"]
blocks: []
acs: []
files_hint: ["docs/features/ai-chat-v2/spec.md", "docs/features/ai-chat-v2/adr/0014-run-the-chat-on-claude-haiku-5-5-through-the-ai-gateway-on-paid-terms.md", "docs/features/ai-chat-v2/sad.md", "docs/features/ai-chat-v2/_ship/changelog.md", "docs/features/ai-chat-v2/_ship/pr-body.md", "docs/features/ai-chat-v2/_ship/security-review-2026-10-14.md"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T107 — Docs describe the bounds as they are, with the estimate marked and exclusions named (N-2 docs, N-3, N-4)

Follow-up task from the final review after T103–T105, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Final review after T103–T105).

## Problem

spec, ADR-0014, sad §11, changelog and pr-body overstate the bounds; ADR-0014 :59 says the limit stops repeated paid failures; the 12-call cap only counts calls that pass input validation.

## Definition of Done

- spec bounds row, ADR-0014 (:52 and :59), sad §11, changelog and pr-body: per-answer cap now covers read and propose_draft answers including links (T106); pinned/prior steps are charged against the turn budget but never cut; the worst case lists what it excludes (user message ≤ 2,000 chars, model-written tool inputs and text across ≤ 8 steps) and '30–60k tokens, below the 100k tier' is labelled an estimate; ADR-0014 :59 says the limit slows repeated failures to at most 10 a minute per Freelancer; the spec row notes calls rejected for invalid input before execution do not use the 12-call cap. Security file: a 'Resolution (final review)' line mapping N-1..N-4 → T106/T107. Changelog lists T106–T107. No tests.
- Commit with `SDD-Task: T107`.
