---
id: T12
title: "Classify every chat message as in_scope, mixed or off_topic before the agent and end off-topic turns with the fixed refusal"
layer: "app"
deps: ["T04"]
blocks: ["T29"]
acs: ["AC-06", "AC-06b"]
files_hint: ["lib/ai/router.ts", "lib/ai/instructions/refusal.ts", "tests/unit/lib/ai/router.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T12 — Classify every chat message as in_scope, mixed or off_topic before the agent and end off-topic turns with the fixed refusal

## Place in the sequence

- **Blocked by:** T04 — Install the pinned AI SDK, gateway and Mastra packages, add the model settings and the Mastra instance on its own mastra schema · **Blocks:** T29 — Define the chat agent: instructions, tool set, 8-step cap, 40-message history and the turn runner the route calls · **Wave:** 2 — ADR-0005 — runs before any tool is loaded.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to help with my own data, my drafts and finding things in the app, and to tell me briefly when something is outside that
> **So that** I know what it is for and never mistake it for tax or legal advice
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task lets the chat tell the Freelancer briefly what it is for, so an off-topic question gets one sentence, loads no tools and is measured by code.

## Inlined context

> **A topic router classifies every message before the tool agent runs** (ADR-0005). A short structured classification sees the new message plus the last few turns and returns `in_scope`, `mixed` or `off_topic`.
> - `off_topic` ends the run with the fixed one-sentence refusal, so no tools are loaded and none can be jailbroken.
> - `mixed` runs the agent with an instruction to refuse the rest in one sentence.
> - The verdict is recorded by code, so the Off-topic KPI and the ≥ 95 % / ≤ 5 % evaluation measure the router directly (QG-3).
>
> — `sad.md §4, strategic choice 3, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1. (**Router before the agent** — a short structured classification (`in_scope` / `mixed` / `off_topic`) over the new message and the last few turns, run as a Mastra input processor; `off_topic` ends the run with the fixed refusal and no tools.)
>
> — `adr/0005 §Decision outcome + Option 1, abridged` · full text: [ADR-0005](../adr/0005-classify-each-message-with-a-topic-router-before-the-tool-agent.md)

> The chat answers only three kinds of requests: questions about the Freelancer's own data (through the seven existing read questions), drafting an invoice, and short "where is this in the app" help. Everything else is an Off-topic request and gets a one-sentence refusal.
>
> — `spec.md §1, Committed approach, abridged` · full text: [spec.md](../spec.md)

> A message that mixes an in-scope request with an off-topic part gets the in-scope answer plus a one-sentence refusal of the rest. Only a message that is entirely off-topic is an Off-topic request.
>
> — `spec.md §1, decision "One card per message", abridged` · full text: [spec.md](../spec.md)

> **Internationalisation:** The Assistant replies in the language of the Freelancer's message, Ukrainian and English included, refusals and follow-up questions too; the router's fixed refusal exists in both.
>
> — `sad.md §8, Internationalisation, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([ADR-0005](../adr/0005-classify-each-message-with-a-topic-router-before-the-tool-agent.md) · [sad.md](../sad.md)) and follow it. Do not guess.

## Data delta

No DB changes. (The verdict is written to `AssistantTurn.topic` by the turn save in T25; this task returns it.)

## API contract

Internal — no API surface. Module: `classifyMessage({ message, recentTurns }) → { topic: 'IN_SCOPE' | 'MIXED' | 'OFF_TOPIC'; language: 'uk' | 'en' | string }` as a Mastra input processor, plus `OFF_TOPIC_REFUSAL` (en + uk) and the `MIXED` instruction string.

## Acceptance criteria

### AC-06 — error

> **Given** a signed-in Freelancer
> **When** they ask the chat whether they should charge VAT to a client abroad
> **Then** the Assistant answers in one sentence that it can only help with their own data in the app, drafting invoices, and finding things in the app — it gives no advice, and the message counts toward the Daily message allowance
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-06b — error

> **Given** a Freelancer with a Customer Acme Corp and a default bank account in USD
> **When** they write "invoice Acme for 20 hours at $50 and tell me if I need to charge VAT"
> **Then** the chat shows the draft card and refuses the VAT part in one sentence. The message counts once toward the allowance and is not counted as an Off-topic request.
>
> — `spec.md §5, AC-06b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Structured-output classification (zod 3.25 schema) over the new message + last few turns, through `getChatModel()` — `lib/ai/router.ts`
- [ ] Fixed refusal in English and Ukrainian ("I can only help with your own data in Invoice Forge, drafting invoices, and finding things in the app.") and the mixed-message instruction — `lib/ai/instructions/refusal.ts`
- [ ] Input-processor wiring so `off_topic` short-circuits before the agent loads tools — `lib/ai/router.ts`
- [ ] Unit tests with a stub model: off_topic → refusal, no tool schemas sent; mixed → instruction added; in_scope → passthrough; refusal language follows the message — `tests/unit/lib/ai/router.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| "how much did Acme pay me this year?" | in scope — money words do not make it off-topic (AC-08) |
| Classification call fails | turn fails as system-side (`FAILED`, slot released by the route) |
| Message in Ukrainian, off-topic | the Ukrainian fixed refusal |
| "draft an invoice and write me a poem" | `MIXED` |

## Definition of Done

- [ ] Unit tests with a stub model show off_topic ends the turn with the fixed one-sentence refusal in the message's language and loads no tools, mixed hands the agent an instruction to refuse the rest in one sentence, in_scope passes through, and the verdict is returned to the caller as IN_SCOPE / MIXED / OFF_TOPIC.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
