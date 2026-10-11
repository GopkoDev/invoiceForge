---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0003 — Run the model through the AI SDK and the Vercel AI Gateway on Claude Haiku 5.5

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

No AI runtime is installed. The product pays for every token, the spec caps model cost per message, and a provider outage must be visible within seconds without affecting the rest of the app. The owner named the AI SDK and Vercel's model provider in the idea brief. Pricing checked on 2026-10-11 (Anthropic list prices per million tokens): Claude Haiku 5.5 USD 0.10 in / 0.50 out; Claude Sonnet 5.5 USD 2 in / 10 out.

## Decision drivers

- Spec §6: model cost per message p95 ≤ USD 0.02; at most 8 tool steps per message and the latest 40 messages of history.
- Spec §6: model provider outage shown within 10 s; every other part of the app keeps working.
- Spec §6.1 / §8: the Privacy page must name the external processor(s) before ship.
- §2: exact pins for upgrade-sensitive dependencies; zod 3.25 schemas.

## Considered options

1. **AI SDK + Vercel AI Gateway, `claude-haiku-5-5`** — one gateway secret, provider fallback configured at the gateway call, cost reported per call.
2. **AI SDK + the Anthropic provider package directly** — one fewer processor, no gateway failover, cost computed from token counts and a price table.
3. **The official Anthropic TypeScript SDK with its tool runner** — full Claude API surface, but no `useChat` protocol; the client and message format are hand-written.

## Decision outcome

**Chosen:** Option 1. A worst case of ~136k input tokens per message costs about USD 0.015 on Haiku 5.5 and well over USD 0.02 on Sonnet 5.5 even with caching, so Haiku 5.5 is the default model; the gateway's fallback and per-call cost reporting serve the outage and cost NFRs directly, and the AI SDK is what `useChat` (ADR-0002) and Mastra (ADR-0004) build on.

## Consequences

**Positive**
- The model id is a setting (`AI_CHAT_MODEL`, default `anthropic/claude-haiku-5-5`); a change is a config change gated by the evaluation run.
- Cost per message is read from the gateway response metadata, not estimated.

**Negative**
- Two processors to name on the Privacy page: Vercel (gateway) and Anthropic (model).
- One extra network hop per model call.
- New required setting `AI_GATEWAY_API_KEY` in `lib/env/required-settings.ts`; the build fails without it.

**Neutral**
- Switching to option 2 later is a provider-line change; the stream and message shapes stay the same.

## Links

- Spec: [[../spec.md]] §6, §6.1, §8
- SAD: [[../sad.md]] §2, §4, §7
- Related ADR: [[0004-use-mastra-for-the-agent-and-metadata-only-tracing]]
