---
id: T103
title: "One turn's tool answers share a byte budget and a call cap; truncation never splits a character (SEC-M-02, SEC-L-04)"
layer: "backend"
deps: ["T102"]
blocks: []
acs: []
files_hint: ["lib/ai/limits.ts", "lib/ai/tools/read-tools.ts", "lib/ai/turn-context.ts", "lib/ai/run-turn.ts", "lib/ai/tools/propose-draft.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T103 — One turn's tool answers share a byte budget and a call cap; truncation never splits a character (SEC-M-02, SEC-L-04)

Follow-up task from the security re-check of 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Re-check after T99–T102).

## Problem

Caps are per answer, so parallel tool calls and answers kept across steps can still put 300k+ tokens into one model call; propose_draft answers, prior steps and links are uncapped; char counts undercount non-ASCII tokens; the 20k cap has no final check; slicing can split a surrogate pair.

## Definition of Done

- (1) Measure sizes in UTF-8 bytes (`Buffer.byteLength(JSON.stringify(x), 'utf8')`) for the tool-answer cap and `trimHistoryToBudget` (rename constants to *_BYTES; history 40,000 bytes, per answer 20,000 bytes with a hard final check that always holds). (2) A per-turn tool budget in `TurnContext`: all chat tool answers that reach the model (read tools, `find_in_app`, `propose_draft`, `ask_user`) count against TURN_TOOL_BUDGET_BYTES = 60,000 and TURN_TOOL_CALLS_MAX = 12; once either is spent, a tool returns a short fixed answer ('The tool budget for this message is used up; answer from what you already have.') without running the read. The pinned/prior propose_draft and prior ask_user steps count against the same budget. (3) Link labels capped (e.g. 80 chars). (4) Truncation never splits a surrogate pair (cut one char earlier when the last kept char is a high surrogate). Unit tests: N parallel get_invoice calls in one step keep the summed tool-answer bytes ≤ budget and the 13th call gets the fixed answer; a propose_draft answer counts; emoji at the cut boundary yields valid UTF-16; hard final byte cap holds for adversarial shapes. Scoped gate: tests/unit/lib/ai, tests/contract, run-turn + chat-route integration under caffeinate, tsc, eslint.
- Commit with `SDD-Task: T103`.
