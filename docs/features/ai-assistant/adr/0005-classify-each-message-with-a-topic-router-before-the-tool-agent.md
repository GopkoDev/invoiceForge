---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0005 — Classify each message with a topic router before the tool agent

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The chat answers only three kinds of requests — the Freelancer's own data, drafting an invoice, and "where is this in the app" help. Everything else is an Off-topic request with a one-sentence refusal that still counts. A message mixing an in-scope request with an off-topic part gets the in-scope answer plus a one-sentence refusal and is not an Off-topic request. The idea brief asked for an orchestrator that refuses off-topic requests and picks the right tool.

## Decision drivers

- Spec §6: ≥ 95 % of off-topic questions refused and ≤ 5 % of in-scope questions refused on a fixed labelled set of ≥ 100 questions.
- Spec §7: Off-topic request share must be measurable.
- Spec §6.1: jailbreaks into a general chatbot are a cost-abuse case.
- Spec §6: first visible words ≤ 3 s p95; cost per message ≤ USD 0.02 p95.

## Considered options

1. **Router before the agent** — a short structured classification (`in_scope` / `mixed` / `off_topic`) over the new message and the last few turns, run as a Mastra input processor; `off_topic` ends the run with the fixed refusal and no tools.
2. **One agent, boundary in its instructions** — the agent decides and reports the message kind itself.

## Decision outcome

**Chosen:** Option 1. The verdict is recorded by code, so the KPI and the evaluation measure one component directly; off-topic messages never load tool schemas, which keeps them cheap and keeps jailbreaks away from the tools. The extra call is short and fits the first-words budget.

## Consequences

**Positive**
- The boundary can be evaluated and tuned without touching the agent's tool behaviour.
- Off-topic refusals are uniform, fixed text in the Freelancer's language.

**Negative**
- One more model call per message (latency, and on the free tier one more request against the project rate limit); a router failure is a system-side failure (not counted, AC-11).
- The router sees a few previous turns so follow-ups like "make it 25 hours" stay in scope; a too-short window would misclassify them.

**Neutral**
- The verdict also carries `intent` (`read` or `draft`; T38, R-07). It is set from the Freelancer's own message only, and code lets `propose_draft` park a card only when it is `draft` (AC-15), so stored text cannot yield a card even if the model obeys it.
- Moving to option 2 later is a change of the agent's input processors only.

## Links

- Spec: [[../spec.md]] §1, §6, §6.1, §7, AC-06, AC-06b, AC-08
- SAD: [[../sad.md]] §4, §6, §10
- Related ADR: [[0004-use-mastra-for-the-agent-and-metadata-only-tracing]]
