---
id: T99
title: "Every model call stays well below 100k input tokens: output caps, a history size budget, and capped tool answers in the chat (SEC-M-01 a, b)"
layer: "backend"
deps: ["T98"]
blocks: []
acs: []
files_hint: ["lib/ai/router.ts", "lib/ai/run-turn.ts", "lib/ai/agent.ts", "lib/ai/tools/read-tools.ts", "lib/services/conversations/conversations.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T99 — Every model call stays well below 100k input tokens: output caps, a history size budget, and capped tool answers in the chat (SEC-M-01 a, b)

Follow-up task from the ADR-0014 security review addendum, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Addendum — ADR-0014 model switch). Owner chose: bounds in code + rate limit; AC-11 unchanged.

## Problem

No maxOutputTokens is set; the 40-message history counts messages, not size; read tool answers (e.g. get_invoice notes/terms/description/lines) are unbounded, so later agent steps can exceed 100k input tokens at the 5x price.

## Definition of Done

- (1) `maxOutputTokens`: router 300 (lib/ai/router.ts generateText), agent 2000 per step (chatAgent.stream options in lib/ai/run-turn.ts, or the agent's defaultOptions). (2) History budget: after the 40-message cap, the history sent to the model keeps the newest messages whose text parts total at most 40,000 characters (drop oldest whole messages; the newest message always kept); one exported constant. (3) Chat tool answers: in the chat wrapper `lib/ai/tools/read-tools.ts` (NOT the shared lib/assistant-tools registry, so MCP answers and contracts are unchanged), every read answer passed to the model is capped: strings over 2,000 chars truncated with a marker, arrays over 50 items cut with `truncated: true`, and the serialized answer at most 20,000 chars (further trimmed if needed); links extraction still sees the full answer. Constants exported. Unit tests for each bound (router and agent call options via MockLanguageModelV4 like tests/unit/lib/ai/gateway-only-anthropic.test.ts; history budget; tool-answer capping incl. a huge invoice); an MCP contract test still passes unchanged. Scoped gate: related tests, tests/contract for MCP read tools, tsc, eslint on changed files.
- Commit with `SDD-Task: T99`.
