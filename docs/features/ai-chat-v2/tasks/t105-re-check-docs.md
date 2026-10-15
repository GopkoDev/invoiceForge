---
id: T105
title: "Docs state the real bounds after the re-check (SEC-M-02, SEC-L-05, SEC-I-06 docs)"
layer: "docs"
deps: ["T104"]
blocks: []
acs: []
files_hint: ["docs/features/ai-chat-v2/spec.md", "docs/features/ai-chat-v2/adr/0014-run-the-chat-on-claude-haiku-5-5-through-the-ai-gateway-on-paid-terms.md", "docs/features/ai-chat-v2/sad.md", "docs/features/ai-chat-v2/contracts/openapi.yaml", "docs/features/ai-chat-v2/_ship/pr-body.md", "docs/features/ai-chat-v2/_ship/changelog.md", "docs/features/ai-chat-v2/_ship/feature.md", "docs/features/ai-chat-v2/_ship/security-review-2026-10-14.md"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T105 — Docs state the real bounds after the re-check (SEC-M-02, SEC-L-05, SEC-I-06 docs)

Follow-up task from the security re-check of 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Re-check after T99–T102).

## Problem

spec, ADR-0014 and pr-body overstate the bounds and describe the old per-minute counting; the openapi 429 and ActionFailure descriptions name only the used-up answer.

## Definition of Done

- spec.md (~646, ~648), ADR-0014 (:52, :59 and the security revision), sad §11 and pr-body (~14) describe T103 (byte budgets, 60,000-byte per-turn tool budget, 12 tool calls, surrogate-safe cuts; realistic worst case per call stated, e.g. well under 100k tokens) and T104 (atomic 10/min in the shared limit store, refusals write no turn rows; the FAILED steps-0 cost-0 note from T102 is removed or corrected, incl. `_ship/feature.md` weekly check). openapi.yaml 429 description and ActionFailure description mention TOO_FAST. Security addendum re-check gets a 'Resolution' line mapping SEC-M-02/SEC-L-04 → T103, SEC-L-05/SEC-I-06 → T104/T105. Changelog lists T103–T105. No tests.
- Commit with `SDD-Task: T105`.
