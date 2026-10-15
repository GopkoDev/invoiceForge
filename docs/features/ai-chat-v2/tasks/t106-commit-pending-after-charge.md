---
id: T106
title: "A card or form is kept only when its answer fits the turn budget; draft answers and links are inside the byte cap (N-1, N-2 code)"
layer: "backend"
deps: ["T105"]
blocks: []
acs: []
files_hint: ["lib/ai/limits.ts", "lib/ai/tools/propose-draft.ts", "lib/ai/tools/ask-user.ts", "lib/ai/tools/read-tools.ts", "lib/ai/run-turn.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T106 — A card or form is kept only when its answer fits the turn budget; draft answers and links are inside the byte cap (N-1, N-2 code)

Follow-up task from the final review after T103–T105, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Final review after T103–T105).

## Problem

withToolBudget runs the tool body (which sets turn.pending.card/.resolver/.ask) before charging; an answer that doesn't fit returns the budget text but the card/form still shows, drafted stays false, add-page links can leak (R2-B3). propose_draft answers have no per-answer cap; read-tool links are added after capToolAnswer's final check.

## Definition of Done

- Tool bodies that set turn.pending (propose_draft, ask_user) commit their pending change only after the answer was charged successfully (e.g. the body returns { answer, commit } and withToolBudget calls commit() only on a successful charge), so a refused answer leaves turn.pending, drafted and the shown card/form unchanged. propose_draft answers pass through capToolAnswer (≤ 20,000 bytes) like read answers; read-tool links are included inside the capped answer's final byte check. Tests: with bytesLeft nearly spent, a CARD answer → no pending card, no card part, drafted false, and the model got the budget text; same for ask_user (no form); a 50-line ISSUES answer is ≤ 20,000 bytes; a read answer with many links stays ≤ 20,000 bytes. Scoped gate: tests/unit/lib/ai, run-turn + chat-route integration under caffeinate, tsc, eslint.
- Commit with `SDD-Task: T106`.
