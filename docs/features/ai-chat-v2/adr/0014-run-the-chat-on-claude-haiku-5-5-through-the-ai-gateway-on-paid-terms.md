---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-16"
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
3. **Claude Haiku 5.5 through the Gateway on paid API terms** — about USD 0.015 for a worst-case message (USD 0.10 / 0.50 per million input / output tokens, see Sources), one key (`AI_GATEWAY_API_KEY`), no bring-your-own-key.

## Decision outcome

**Chosen:** Option 3. It closes the free-tier privacy contradiction and the request cap like Option 2, and stays inside the USD 0.02 cost cap; the owner prefers it for reply quality. The default `DEFAULT_CHAT_MODEL` becomes `anthropic/claude-haiku-5.5`; `AI_CHAT_MODEL` still overrides it, but only with another `anthropic/*` model; another vendor also needs `GATEWAY_PROVIDER_OPTIONS` changed (see Neutral).

## Sources

- Vercel AI Gateway model list (https://ai-gateway.vercel.sh/v1/models, read 2026-10-15): `anthropic/claude-haiku-5.5` costs USD 0.10 / 0.50 per million input / output tokens up to 100k input tokens, and 5x that above 100k.

## Consequences

**Positive**
- The privacy contradiction is gone: paid API terms, no training on the content. The inherited §1 ¶4 override and the free-tier risks in sad §11 close.
- No free-tier request cap; capacity follows the Gateway's and Anthropic's paid limits.
- One secret less: `GOOGLE_GENERATIVE_AI_API_KEY` is removed from the required settings and `env.example`, and the unused `@ai-sdk/google` package is removed. The build now requires only `AI_GATEWAY_API_KEY` for the model.
- The model is still resolved through `gateway()`; the only call change is the Anthropic provider pin added in T94 (`GATEWAY_PROVIDER_OPTIONS`).

**Negative**
- Model spend is no longer zero: every token is paid, about USD 0.015 for a worst-case message. The weekly p95 cost check (USD 0.02) becomes a live guard from launch, not a future one.
- The price is 5x (USD 0.50 / 2.50 per million tokens) for a call above 100k input tokens. The history sent to the model is capped at the latest 40 messages, so a turn stays well below that tier. *Revision 2026-10-15 (ADR-0014, security):* that claim was wrong: 40 messages cap the count, not the size. What bounds a turn is now in code (T99): `maxOutputTokens` 300 on the router and 2,000 on the app agent; the history sent to the model is trimmed to 40,000 bytes (oldest whole messages dropped, the newest always kept); a chat tool answer, read or `propose_draft`, is cut to 2,000 characters per string, 50 items per list and 20,000 bytes in all, links included (`capToolAnswer`, T106; applied to the model's copy only, so MCP answers do not change). Pinned and prior steps are charged against the turn budget but never cut. The re-check showed that per-answer caps are not a per-call bound, so T103 added one budget per turn: all tool answers together at most 60,000 bytes and at most 12 tool calls (read tools, `find_in_app`, `propose_draft`, `ask_user`, pinned and prior steps; link labels at most 80 characters; cuts never split a surrogate pair). Worst case per model call: fixed instructions and tool schemas about 4-8k tokens, plus history at most 40,000 bytes, plus tool answers at most 60,000 bytes, so at most about 110,000 bytes of variable input, on the order of 30-60k tokens, an estimate rather than a measured figure, and below the 100k-token tier by that estimate (bytes are an upper bound on tokens for byte-level tokenizers). The worst case leaves out the Freelancer's message (at most 2,000 characters) and the model-written tool inputs and text across at most 8 steps. The Gateway spend budget on the Vercel team is the owner's backstop.
- A new processor replaces Google: Anthropic, with Vercel as the gateway. The privacy page (section 11, §5 sub-processor table) and the terms page (§10 sub-processor table, which did not list the model provider before) must name Anthropic before ship. Done in T90 (privacy §11, privacy §5 and terms §10 Anthropic rows); T90 changed the tests `privacy-ai-section`, `privacy-page-ai-section`, the new `public-pages-ai-subprocessor` and the e2e `ai-chat-v2-preview-dashboard` (line 418). The wording and the Last-updated date still wait for the owner.
- The instructions, the router and the evaluation sets were tuned on Gemini Flash-Lite. Behaviour may shift (topic boundary, no-guessing guard, form use); `pnpm eval:assistant` must pass on the new default before release.
- Deploy environments that still carry `GOOGLE_GENERATIVE_AI_API_KEY` keep an unused secret until it is removed there.
- *Revision 2026-10-15 (ADR-0014):* chat model calls are pinned to Anthropic at the Gateway (`GATEWAY_PROVIDER_OPTIONS` in `lib/ai/gateway-options.ts`, re-exported from `lib/ai/model.ts`), so the processor list on the privacy page is true (T94). There is no cross-provider fallback through Bedrock or Vertex, so an Anthropic outage surfaces as 'AI temporarily unavailable'.
- Under paid terms the Gateway-reported cost is the live number, so a call with no reported cost is recorded as unknown (`AssistantTurn.costUsd = null`), never as free; a turn with any unknown call stores null (T91). *Revision 2026-10-15 (ADR-0014):* a failed turn whose router cost is unknown also stores null, and the router verdict always carries its cost (T95).

- *Revision 2026-10-15 (ADR-0014, security):* the chat refuses more than 10 messages a minute per Freelancer (T100, `CHAT_PER_MINUTE_MAX`), counted atomically in the shared limit store (T104: `LimitScope` `CHAT_MESSAGE`, key = user id, one `REQUESTED` event per admitted message, kept 1 day by the store's purge; migration `20261015100000_add_chat_message_limit_scope` adds the enum value), before any slot or model call (429 `TOO_FAST`; a store failure answers 503). The daily allowance (AC-11) is unchanged: a refused message reserves and counts nothing. Because a failed turn gives its slot back, the allowance alone did not stop repeated paid failures; this limit slows repeated failures to at most 10 a minute per Freelancer. A refusal writes no row: there is no `AssistantTurn` for it, so it is visible as an absent turn and, when needed, through the `LimitEvent` rows of the `CHAT_MESSAGE` scope; the weekly 'system-side failures > 2 %' signal is not polluted by it.
- *Revision 2026-10-15 (ADR-0014, security):* every Gateway call asks for no prompt training (`disallowPromptTraining: true` next to `only: ['anthropic']`, T101); the Gateway fails closed when no provider matches. The app agent also carries the pin in its `defaultOptions`, so a future second call site cannot skip it. Privacy §5 and terms §10 name the AI Gateway in the Vercel row.
- *Revision 2026-10-15 (ADR-0014, option A):* the owner keeps Anthropic and adds zero data retention. Facts from the live Gateway endpoints list (read 2026-10-15): the `anthropic` endpoint for Haiku 5.5 reports `inference_regions` as US only and `has_zdr`; EU inference exists only through `bedrock` (eu-central-1) and `vertexAnthropic` (EU zone), which are rejected for now because each adds another processor and a bring-your-own-key setup. Every Gateway call therefore also sets `zeroDataRetention: true` next to `only: ['anthropic']` and `disallowPromptTraining: true` (T109); a team without ZDR eligibility fails closed (every turn answers AI unavailable), so the team's eligibility is checked on preview. The app itself runs in the EU: Vercel `fra1` and Neon `eu-central-1` (Frankfurt), dev and prod. Message text goes to the model in the USA under SCCs; the privacy page (§5, §11) and terms §10 say so (T109).
- *Revision 2026-10-16 (ADR-0014, T113):* the Vercel team is on the Hobby plan and the Gateway refuses `zeroDataRetention` (a direct call returned "ZDR is only available for Pro and Enterprise plans"), so every turn failed closed. Zero data retention is dropped; `only: ['anthropic']` and `disallowPromptTraining` stay. Anthropic's API retention applies: text is deleted within 30 days, kept up to 2 years if flagged for a Usage Policy violation, and longer where the law requires. The Gateway keeps no content. Privacy §5 and §11 and terms §10 say so. Moving the team to Pro and re-adding `zeroDataRetention` is the path back.

**Neutral**
- *Revision 2026-10-15 (ADR-0014, option A, wording; T111):* Anthropic is a US company and the `anthropic` endpoint offers no EU region; processing is outside the EU, mainly in the USA. The pages do not claim that inference stays in the US; the +10 % US-zone pin was considered and not taken. Privacy §11 and the §5 / terms §10 tables say so, and the Vercel row reads 'EU (Frankfurt, fra1) for the app; AI Gateway and CDN are global'.
- Switching to another `anthropic/*` model stays a setting change (`AI_CHAT_MODEL`). *Revision 2026-10-15 (ADR-0014, round 3):* since the Anthropic pin (T94), a model from another vendor is refused on every turn until `GATEWAY_PROVIDER_OPTIONS` is changed, and that change needs a privacy §11/§5 and terms §10 update first (plus a key at the Gateway for a bring-your-own-key provider).
- The router and the agent still share one model setting; a cheaper router model remains possible later.

## Links

- Spec: [[../spec.md]] §6, §6.1, §8
- SAD: [[../sad.md]] §2, §3, §7, §11
- Supersedes: [ai-assistant ADR-0003](../../ai-assistant/adr/0003-run-a-gemini-model-through-the-ai-sdk-and-the-vercel-ai-gateway-on-a-free-tier-key.md)
- Related ADR: ai-assistant [ADR-0004](../../ai-assistant/adr/0004-use-mastra-for-the-agent-and-metadata-only-tracing.md) (Mastra agent and tracing, unchanged)
