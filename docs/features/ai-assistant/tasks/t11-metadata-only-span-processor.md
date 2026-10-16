---
id: T11
title: "Strip every text-bearing attribute from Mastra spans before export and pin it with a span contract test"
layer: "infra"
deps: ["T04"]
blocks: ["T29"]
acs: []
files_hint: ["lib/ai/observability/metadata-only-processor.ts", "lib/ai/mastra.ts", "tests/contract/ai-spans-metadata-only.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T11 — Strip every text-bearing attribute from Mastra spans before export and pin it with a span contract test

## Place in the sequence

- **Blocked by:** T04 — Install the pinned AI SDK, gateway and Mastra packages, add the model settings and the Mastra instance on its own mastra schema · **Blocks:** T29 — Define the chat agent: instructions, tool set, 8-step cap, 40-message history and the turn runner the route calls · **Wave:** 2 — ADR-0004's guard rail; it must exist before the agent emits a single trace.
- **Lane:** shares `lib/ai/mastra.ts` with T04, T29 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to delete one or all of my Conversations, and to know they are deleted automatically after 90 days
> **So that** my customers' names and amounts do not pile up in a chat history forever
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

This task keeps the Conversation the only copy of what was said: traces carry metadata only, so deleting a Conversation really deletes its content.

## Inlined context

> - **Metadata-only span processor.** Every Mastra span passes a processor that removes input, output, message and tool-argument/result attributes and keeps only names, step counts, durations, token counts, cost and outcome; a contract test fails the build if any exported span carries text.
>
> — `adr/0004 §Decision outcome, guard rail 1, verbatim` · full text: [ADR-0004](../adr/0004-use-mastra-for-the-agent-and-metadata-only-tracing.md)

> | Observability | Metadata-only traces: a Mastra span processor drops every text-bearing attribute (input, output, messages, tool arguments and results) before export, and a contract test fails on any exported text (ADR-0004). Per-turn KPIs are in `AssistantTurn`. Errors go to Sentry through `redactError`. |
>
> — `sad.md §8, Observability, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** **Text leaking into Mastra traces after an upgrade.** A new Mastra version may add a text-bearing span attribute that the metadata-only processor does not strip (ADR-0004). | High | Exact pins for every Mastra package; a contract test exports spans from a scripted turn and fails on any message text, tool argument or tool answer; it reruns on every Mastra upgrade.
>
> — `sad.md §11, risk row 4, abridged` · full text: [sad.md](../sad.md)

**Design note for the processor:** prefer an allow-list (keep only known metadata keys) over a deny-list — an attribute added by a Mastra upgrade is then dropped by default, which is what risk row 4 needs.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([ADR-0004](../adr/0004-use-mastra-for-the-agent-and-metadata-only-tracing.md) · [sad.md](../sad.md)) and the pinned Mastra version's span-processor docs (context7). Do not guess.

## Data delta

No DB changes. (Spans land in Mastra's `mastra` schema and Sentry.)

## API contract

Internal — no API surface. Module: `metadataOnlyProcessor` registered on the `mastra` instance from T04.

## Acceptance criteria

No spec §5 AC; the requirement is spec §1 and §6.1:

> - **Debugging traces hold metadata only** (tools called, steps, duration, cost, outcome), never message text or tool answers. The Conversation stays the only copy of the content, so deleting it really deletes it.
>
> — `spec.md §1, decision "Debugging traces", verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Allow-list span processor (names, step counts, durations, token counts, cost, outcome, tool names) — `lib/ai/observability/metadata-only-processor.ts`
- [ ] Register it on the Mastra instance for every exporter (Mastra store and Sentry) — `lib/ai/mastra.ts`
- [ ] Contract test: a stub-model turn with a distinctive message ("CANARY-7f3 invoice Acme"), a tool call with a canary argument and a canary answer; collect exported spans; assert no attribute value contains any canary, and that duration/steps/tokens survive — `tests/contract/ai-spans-metadata-only.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Unknown attribute key from a Mastra upgrade | dropped (allow-list) |
| Error span with a provider message containing user text | message dropped; error class / code kept |
| Tool names | kept (names only, never arguments) |

## Definition of Done

- [ ] A contract test runs a scripted turn through a stub model with the processor registered, collects every exported span, and fails if any attribute carries the message text, a tool argument, a tool answer or a model output; names, step counts, durations, tokens, cost and outcome survive.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
