---
id: T94
title: "Chat model calls are pinned to Anthropic at the Gateway, so the privacy page's processor list is true (review round 2 N1, N5)"
layer: "backend"
deps: ["T93"]
blocks: []
acs: ["AC-35"]
files_hint: ["lib/ai/model.ts", "lib/ai/router.ts", "lib/ai/run-turn.ts", "constants/public-pages-content.ts", "tests/component/public-pages-ai-subprocessor.test.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T94 — Chat model calls are pinned to Anthropic at the Gateway, so the privacy page's processor list is true (review round 2 N1, N5)

Follow-up task from round 2 of the ADR-0014 review, 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md) (Round 2).

## Problem

The Vercel AI Gateway serves `anthropic/claude-haiku-5.5` from four providers (anthropic, bedrock, claudeaws, vertexAnthropic). With no provider restriction, message text can reach Amazon or Google, while privacy §11/§5 and terms §10 name only Anthropic. Terms §10's transfer sentence names only Vercel and Neon.

## Definition of Done

- Both the router call (`lib/ai/router.ts`) and the agent stream (`lib/ai/run-turn.ts` → `chatAgent.stream`) pass `providerOptions: { gateway: { only: ['anthropic'] } }` (one shared constant, e.g. in `lib/ai/model.ts`), for gateway models only; the e2e stub path is unaffected. Unit tests assert the option reaches both calls. `constants/public-pages-content.ts:813` reads 'All providers listed …' like privacy §5, covered by `tests/component/public-pages-ai-subprocessor.test.ts`. Scoped gate: related tests, tsc, eslint on changed files.
- Commit with `SDD-Task: T94`.
