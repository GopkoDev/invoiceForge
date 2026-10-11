---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0004 — Use Mastra for the agent and metadata-only tracing

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The idea brief names Mastra "for debugging and statistics". The spec requires per-message traces for latency, cost, failure rate and KPIs, an evaluation run on a labelled set of ≥ 100 questions before release and on every change to the Assistant's instructions, and — strictly — traces that hold metadata only, never message text or tool answers, so that deleting a Conversation deletes the only copy of its content.

## Decision drivers

- Spec §1 / §6.1: debugging traces hold metadata only (tools called, steps, duration, cost, outcome).
- Spec §6: topic boundary accuracy and the no-guessing guard measured on an evaluation set before release and on every instruction change.
- Spec §7: off-topic share, turns per draft, weekly active chat users, allowance exhaustion, model cost per weekly active chat user.
- Owner preference recorded in the idea brief.

## Considered options

1. **Own metadata only** — a Sentry span and one metadata row per message, an evaluation script in the repo; no Mastra.
2. **Mastra as the agent and observability layer** — Mastra defines the agent, runs evaluations, and stores traces for its local studio.
3. **Mastra for evaluations in development only** — production as option 1; Mastra as a dev dependency driving the same agent.

## Decision outcome

**Chosen:** Option 2, with two guard rails that keep it inside the spec:

- **Metadata-only span processor.** Every Mastra span passes a processor that removes input, output, message and tool-argument/result attributes and keeps only names, step counts, durations, token counts, cost and outcome; a contract test fails the build if any exported span carries text.
- **Prisma stays the source of record.** Conversations, Draft cards and counters stay in Prisma tables (ADR-0008, ADR-0009); Mastra Memory is not used. Mastra's storage lives in a separate `mastra` schema of the same database, created and migrated by Mastra, holding traces and evaluation results only. KPI figures come from a per-message metadata row in Prisma (kind, outcome, steps, tools, duration, tokens, cost — no text), so they survive Mastra upgrades and Conversation deletion.

## Consequences

**Positive**
- A ready agent abstraction (instructions, tools, input processors for the topic router — ADR-0005), evaluation tooling and a local trace studio for debugging.
- The owner's preferred tooling; evaluation runs reuse the production agent definition.

**Negative**
- A second framework over the AI SDK; Mastra versions are pinned exactly and upgraded deliberately.
- A second schema in the database that Prisma does not manage; its migrations run through Mastra's own initialisation, outside `prisma migrate`.
- The metadata-only rule now depends on the span processor; a Mastra upgrade that adds a new text-bearing attribute must be caught by the contract test (§11).
- Next.js must treat the Mastra packages as server-external packages.

**Neutral**
- Dropping Mastra later means re-hosting the agent on the AI SDK directly; Conversations and counters are unaffected because they never lived in Mastra.

## Links

- Spec: [[../spec.md]] §1, §6, §6.1, §7
- SAD: [[../sad.md]] §4, §5, §7, §8, §11
- Related ADR: [[0003-run-a-gemini-model-through-the-ai-sdk-and-the-vercel-ai-gateway-on-a-free-tier-key]], [[0008-store-conversations-in-prisma-tables-keeping-only-what-the-freelancer-saw]]
