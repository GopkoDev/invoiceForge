---
id: T101
title: "Gateway requests ask for no prompt training; the app agent carries the pin in its defaults; privacy §5 Vercel row names the AI Gateway (SEC-L-03, SEC-I-04, SEC-I-03)"
layer: "backend"
deps: ["T100"]
blocks: []
acs: ["AC-35"]
files_hint: ["lib/ai/gateway-options.ts", "lib/ai/agent.ts", "constants/public-pages-content.ts", "tests/unit/lib/ai/gateway-only-anthropic.test.ts", "tests/component/public-pages-ai-subprocessor.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T101 — Gateway requests ask for no prompt training; the app agent carries the pin in its defaults; privacy §5 Vercel row names the AI Gateway (SEC-L-03, SEC-I-04, SEC-I-03)

Follow-up task from the ADR-0014 security review addendum, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Addendum — ADR-0014 model switch). Owner chose: bounds in code + rate limit; AC-11 unchanged.

## Problem

The no-training promise is not enforced on the request; the app chatAgent is pinned only at its call site; privacy §5's Vercel row says only hosting though the AI Gateway processes message text.

## Definition of Done

- `GATEWAY_PROVIDER_OPTIONS` (lib/ai/gateway-options.ts) becomes `{ gateway: { only: ['anthropic'], disallowPromptTraining: true } }` (check the key in node_modules/@ai-sdk/gateway types); tests/unit/lib/ai/gateway-only-anthropic.test.ts asserts it (update its expected constant; the router/stream call assertions use toMatchObject). `lib/ai/agent.ts` chatAgent gets `defaultOptions: { providerOptions: GATEWAY_PROVIDER_OPTIONS }` (keep the call-site option), asserted via getDefaultOptions() like tests/unit/mastra/studio-traces.test.ts. Privacy §5 Vercel row (constants/public-pages-content.ts ~357-361) purpose names the AI Gateway (AI assistant message text); tests/component/public-pages-ai-subprocessor.test.ts asserts it. Scoped gate: related tests, tsc, eslint.
- Commit with `SDD-Task: T101`.
