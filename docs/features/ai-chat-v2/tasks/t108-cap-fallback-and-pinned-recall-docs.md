---
id: T108
title: "The tool-answer cap's last fallback holds with links; docs name the pinned re-call (re-check F-1, F-2)"
layer: "backend"
deps: ["T107"]
blocks: []
acs: []
files_hint: ["lib/ai/tools/read-tools.ts", "tests/unit/lib/ai/tools/read-tools-cap.test.ts", "docs/features/ai-chat-v2/spec.md", "docs/features/ai-chat-v2/sad.md", "docs/features/ai-chat-v2/_ship/security-review-2026-10-14.md"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T108 — The tool-answer cap's last fallback holds with links; docs name the pinned re-call (re-check F-1, F-2)

Follow-up task from the re-check after T106–T107, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Re-check after T106–T107).

## Definition of Done

- `capToolAnswer` (lib/ai/tools/read-tools.ts ~64) checks the exact object it returns (including `links: []` when links were given), so its UTF-8 JSON bytes are always ≤ 20,000; unit test with many top-level keys plus links that reaches the last fallback. spec bounds row and sad §11 add: 'a propose_draft re-call in a pressed turn returns the pinned step's value: charged to the turn budget, not cut'. Security file: 'Resolution' line F-1, F-2 → T108. Scoped gate: tests/unit/lib/ai, tsc, eslint.
- Commit with `SDD-Task: T108`.
