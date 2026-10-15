---
id: T98
title: "The Mastra Studio agent is pinned to Anthropic like the app (review round 3 R3-4)"
layer: "backend"
deps: ["T96"]
blocks: []
acs: []
files_hint: ["mastra/index.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T98 — The Mastra Studio agent is pinned to Anthropic like the app (review round 3 R3-4)

Follow-up task from round 3 of the ADR-0014 review, 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md) (Round 3).

## Problem

`mastra/index.ts:54-61` (dev-only `pnpm studio`) calls the Gateway without `only`, so dev runs on real `.env` records may reach Bedrock or Vertex.

## Definition of Done

- The Studio agent's `defaultOptions` (or equivalent) pass `providerOptions: GATEWAY_PROVIDER_OPTIONS` from `lib/ai/gateway-options.ts`. Gate: tsc, eslint on the file; a unit test only if the Studio config is already unit-tested.
- Commit with `SDD-Task: T98`.
