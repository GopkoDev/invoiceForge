---
id: T97
title: "Docs say only another anthropic/* model is a setting change; weekly cost check; terms SCC sentence in the owner approval (review round 3 R3-1..R3-3)"
layer: "docs"
deps: ["T96"]
blocks: []
acs: ["AC-35"]
files_hint: ["docs/features/ai-chat-v2/adr/0014-run-the-chat-on-claude-haiku-5-5-through-the-ai-gateway-on-paid-terms.md", "env.example", "lib/ai/gateway-options.ts", "docs/features/ai-chat-v2/_ship/pr-body.md"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T97 — Docs say only another anthropic/* model is a setting change; weekly cost check; terms SCC sentence in the owner approval (review round 3 R3-1..R3-3)

Follow-up task from round 3 of the ADR-0014 review, 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md) (Round 3).

## Problem

After T94 every call carries `only: ['anthropic']`, so pointing AI_CHAT_MODEL at another vendor fails every turn and would make the privacy/terms pages untrue, yet ADR-0014:36,60 and env.example:41 present any switch as a setting change. ADR-0014:51 still says 'alert'. The terms §10 SCC sentence is not in the owner's wording approval.

## Definition of Done

- ADR-0014 Neutral (dated revision) and :36 say only another `anthropic/*` model is a pure setting change; another vendor needs `GATEWAY_PROVIDER_OPTIONS` changed plus a privacy §11/§5 and terms §10 update. env.example's AI_CHAT_MODEL comment says the same in one line. `lib/ai/gateway-options.ts:1` comment adds that a non-Anthropic gateway model id is refused by the pin. ADR-0014:51 says 'weekly p95 cost check'. pr-body's owner wording item names the terms §10 'All providers listed above comply with GDPR through SCCs' sentence. Gate: tsc (comment-only code change), no tests.
- Commit with `SDD-Task: T97`.
