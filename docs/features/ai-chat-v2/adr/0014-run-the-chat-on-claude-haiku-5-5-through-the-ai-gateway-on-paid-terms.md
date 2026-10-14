---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-15"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0014 — Run the chat on Claude Haiku 5.5 through the AI Gateway on paid terms

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** Dmytro Hopko (owner decision of 2026-10-14, made in a working session after the consistency pass; recorded post-hoc)
- **Supersedes:** ai-assistant ADR-0003 (a Gemini Flash-Lite model on a Google AI Studio free-tier key). Per §2 *Organisational*, ai-assistant's files are not edited; this ADR is the record of the replacement.

## Context

ai-assistant ADR-0003 ran the chat on a Gemini Flash-Lite model on a free-tier Google key, registered with the Vercel AI Gateway as bring-your-own-key, to keep model spend at zero. That choice carried two inherited overrides into this feature (sad §2 *Regulatory*, §11): the free tier's terms let Google use chat content and contradict the spec's privacy promise, and its project-wide request limits cap the whole chat at a few hundred messages a day. The owner has now chosen to pay for the model instead, which ADR-0003 already listed as Option 1. The code already reflects it (`lib/ai/model.ts`, `lib/env/required-settings.ts`); this ADR records the decision.

## Decision drivers

- Spec §6: model cost per message p95 ≤ USD 0.02.
- Spec §6.1: Conversations are Confidential, and the privacy page names who processes message text (AC on the privacy page, spec §5). The free-tier terms contradicted this (ai-assistant §1 ¶4, inherited in sad §2).
- Spec §6: "AI temporarily unavailable" stays rare. The free-tier request cap was the binding limit (ai-assistant §7, §11).
- sad §2: the AI SDK and the Vercel AI Gateway are already installed; the model is a setting (`AI_CHAT_MODEL`), so a model change needs no new runtime package.

## Considered options

1. **Keep Gemini Flash-Lite on the free-tier key (ADR-0003 as is)** — zero spend; keeps the privacy contradiction and the project-wide request cap.
2. **Gemini Flash-Lite or Flash on paid Google terms through the Gateway** — closes the privacy and cap issues at a lower token price, but keeps the model on which the empty-reply and one-burst-text fixes were needed (ai-assistant `_fixes/2026-10-12-*`).
3. **Claude Haiku 5.5 through the Gateway on paid API terms** — about USD 0.015 for a worst-case message (USD 0.10 / 0.50 per million tokens, ADR-0003 estimate), one key (`AI_GATEWAY_API_KEY`), no bring-your-own-key.

## Decision outcome

**Chosen:** Option 3. It closes the free-tier privacy contradiction and the request cap like Option 2, and stays inside the USD 0.02 cost cap; the owner prefers it for reply quality. The default `DEFAULT_CHAT_MODEL` becomes `anthropic/claude-haiku-5.5`; `AI_CHAT_MODEL` still overrides it.

## Consequences

**Positive**
- The privacy contradiction is gone: paid API terms, no training on the content. The inherited §1 ¶4 override and the free-tier risks in sad §11 close.
- No free-tier request cap; capacity follows the Gateway's and Anthropic's paid limits.
- One secret less: `GOOGLE_GENERATIVE_AI_API_KEY` is removed from the required settings and `env.example`, and the unused `@ai-sdk/google` package is removed. The build now requires only `AI_GATEWAY_API_KEY` for the model.
- No code path changes: the model is resolved through `gateway()` as before.

**Negative**
- Model spend is no longer zero: every token is paid, about USD 0.015 for a worst-case message. The p95 cost alert (USD 0.02) becomes a live guard from launch, not a future one.
- A new processor replaces Google: Anthropic, with Vercel as the gateway. The privacy page (section 11, which names Google Gemini and its free-tier terms), its component test, and the terms page's sub-processor gap (spec §8, T28 note) must change before ship.
- The instructions, the router and the evaluation sets were tuned on Gemini Flash-Lite. Behaviour may shift (topic boundary, no-guessing guard, form use); `pnpm eval:assistant` must pass on the new default before release.
- Deploy environments that still carry `GOOGLE_GENERATIVE_AI_API_KEY` keep an unused secret until it is removed there.

**Neutral**
- Switching back, or to another Gateway model, stays a setting change (`AI_CHAT_MODEL`), plus a key at the Gateway for a bring-your-own-key provider.
- The router and the agent still share one model setting; a cheaper router model remains possible later.

## Links

- Spec: [[../spec.md]] §6, §6.1, §8
- SAD: [[../sad.md]] §2, §3, §7, §11
- Supersedes: [ai-assistant ADR-0003](../../ai-assistant/adr/0003-run-a-gemini-model-through-the-ai-sdk-and-the-vercel-ai-gateway-on-a-free-tier-key.md)
- Related ADR: ai-assistant [ADR-0004](../../ai-assistant/adr/0004-use-mastra-for-the-agent-and-metadata-only-tracing.md) (Mastra agent and tracing, unchanged)
