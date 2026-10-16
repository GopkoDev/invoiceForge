---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0003 — Run a Gemini model through the AI SDK and the Vercel AI Gateway on a free-tier key

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

No AI runtime is installed. The product pays for every token, the spec caps model cost per message, and a provider outage must be visible within seconds without affecting the rest of the app. The owner named the AI SDK and Vercel's model routing in the idea brief, and chose Google Gemini on a free-tier key so that the chat costs nothing to run at launch. During the walk Claude Haiku 5.5 was first approved (USD 0.10 / 0.50 per million tokens, about USD 0.015 for a worst-case message) and then replaced by this decision.

## Decision drivers

- Spec §6: model cost per message p95 ≤ USD 0.02; at most 8 tool steps per message and the latest 40 messages of history.
- Spec §6: model provider outage shown within 10 s; every other part of the app keeps working.
- Spec §6.1 / §8: Conversations are Confidential; the Privacy page must name the external processor(s), their retention and "no training on the data" before ship.
- Owner decision: no model spend at launch.

## Considered options

1. **AI SDK + Vercel AI Gateway, Claude Haiku 5.5** — paid API terms, about USD 0.015 per worst-case message.
2. **AI SDK + Vercel AI Gateway, Gemini on paid terms** — Gateway credits then pay-per-token; the provider's paid terms (no training on API data).
3. **AI SDK + Vercel AI Gateway, Gemini on a Google AI Studio free-tier key (bring-your-own-key)** — no spend; the free tier's terms and project-wide rate limits apply.
4. **A free-tier key for development and evaluation only, paid terms in production.**

## Decision outcome

**Chosen:** Option 3. The owner prefers zero model spend at launch over the paid-terms options. The model id is the setting `AI_CHAT_MODEL`, defaulting to a Gemini Flash-Lite model (the free-tier class with the highest request limits), fixed after the evaluation run; the key is the Freelancer-independent project key `GOOGLE_GENERATIVE_AI_API_KEY` registered with the Gateway as bring-your-own-key.

## Consequences

**Positive**
- Model cost per message is USD 0 while the free tier holds; the cost NFR is met trivially.
- The AI SDK and Gateway keep the model a configuration choice: moving to option 2 or 1 later changes the key and the model id, not the code.

**Negative**
- **Contradicts spec §6.1 and §8.** Under the free tier's terms, Google may use prompts and responses to improve its products and human reviewers may read them; Conversations include Customer names and amounts. Before ship the spec's privacy statements and the Privacy page must be changed to say so, or the key must move to paid terms (§1 override, §11 High risk).
- **Project-wide rate limits — capacity estimate.** Free-tier ranges the owner gathered on 2026-10-11 (an answer from Google's Gemini assistant, to be verified against Google's published rate-limit page before ship): Flash-Lite 15–30 requests/min and 1,500–4,000 requests/day; Flash 10–15/min and 1,500/day; Pro 2–5/min and 50–100/day; about 1,000,000 tokens/min for Flash-class models. One chat message costs 1 router request plus 1–8 agent steps (typically 3–5 requests, worst case 9). On Flash-Lite that is roughly 300–1,300 messages per day for the whole project — about 10–40 Freelancers using their full allowance — and about 3–10 messages per minute at once.
- **Project-wide rate limits.** Free-tier request limits apply to the whole project, not per Freelancer; past the estimate above the chat will show "AI is temporarily unavailable" well before anyone reaches 30 messages. A rate-limited reply is a system-side failure and is not counted (AC-11).
- Two processors to name on the Privacy page: Vercel (gateway) and Google (model).
- New required setting(s) in `lib/env/required-settings.ts`; the build fails without them.

**Neutral**
- The router (ADR-0005) and the agent use the same model setting; a second, cheaper model for the router is possible later.
- Free-tier terms, model names and limits change over time; they are re-checked before ship.

## Links

- Spec: [[../spec.md]] §6, §6.1, §8
- SAD: [[../sad.md]] §1, §2, §4, §7, §11
- Related ADR: [[0004-use-mastra-for-the-agent-and-metadata-only-tracing]]
