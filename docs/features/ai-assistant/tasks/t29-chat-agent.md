---
id: T29
title: "Define the chat agent: instructions, tool set, 8-step cap, 40-message history and the turn runner the route calls"
layer: "app"
deps: ["T11", "T12", "T13", "T27"]
blocks: ["T31", "T32"]
acs: ["AC-11b", "AC-24"]
files_hint: ["lib/ai/agent.ts", "lib/ai/instructions/chat.ts", "lib/ai/run-turn.ts", "lib/ai/mastra.ts", "tests/integration/lib/ai/run-turn.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T29 — Define the chat agent: instructions, tool set, 8-step cap, 40-message history and the turn runner the route calls

## Place in the sequence

- **Blocked by:** T11 — Strip every text-bearing attribute from Mastra spans before export and pin it with a span contract test, T12 — Classify every chat message as in_scope, mixed or off_topic before the agent and end off-topic turns with the fixed refusal, T13 — Wrap the shared read questions as chat tools bound to the acting Freelancer and add find_in_app over a fixed app map, T27 — Add the propose_draft tool that resolves the Freelancer's own words into a pending Draft card or into questions · **Blocks:** T31 — Serve POST /api/chat: validate, check the Conversation, reserve a slot, stream the turn, save it, release on failure, T32 — Add the labelled topic-boundary set and the no-guessing set as a Mastra evaluation run that blocks a failing change · **Wave:** 6 — joins router, tools and tracing into one turn.
- **Lane:** shares `lib/ai/mastra.ts` with T04, T11 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to see how many messages I have left today and what happens when they run out
> **So that** a limit never surprises me in the middle of a task
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to see which drafts an Assistant created and by which Assistant, and to review and issue them myself
> **So that** I check AI work before it reaches a Customer
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task assembles the Assistant itself: one agent that answers in the Freelancer's language, uses only its tools, never pretends it can issue, and stops after 8 steps with an honest partial answer.

## Inlined context

> - **Per-message work cap**: at most 8 tool steps per message; conversation history sent to the model capped at the latest 40 messages
>
> — `spec.md §6, NFR row "Per-message work cap", abridged` · full text: [spec.md](../spec.md)

> | Limits | … The per-message work cap is at most 8 agent steps (`stopWhen`) and the latest 40 visible messages as history; a capped turn returns its partial answer and counts (AC-11b). … |
> | Write safety | … No Assistant can issue, send, edit or delete an invoice; such requests get the AC-24 answer and a link. |
> | Untrusted text (prompt injection) | … the agent's instructions say stored text (notes, addresses, product names) is never a request. … |
> | Internationalisation | The Assistant replies in the language of the Freelancer's message, Ukrainian and English included, refusals and follow-up questions too … |
> | Cost control | A stable prompt prefix: frozen instructions and a deterministic tool order, so provider-side caching applies where offered. Tool answers are not replayed in history (ADR-0008). |
> | Error handling | … A provider error or rate limit is a system-side failure: the slot is released and the message is not counted (AC-11). |
>
> — `sad.md §8, crosscutting rows, abridged` · full text: [sad.md](../sad.md)

> - **Reply rendering:** … The agent instructions ask for plain sentences and `- ` lists so a reply reads well without a renderer.
>
> — `screens.md §Source, Reply rendering, abridged` · full text: [screens.md](../screens.md)

> There are no turn deadlines in code (§7). A rate-limited or failed provider call ends the turn as a system-side failure. Mastra owns the agent definition, the evaluation runs and the debugging traces.
>
> — `sad.md §4, strategic choice 2, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Values are never copied from an earlier invoice ("same as last month"). The chat asks the Freelancer to name them instead.
>
> — `spec.md §1, decision "What a request may set", abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([sad.md](../sad.md) · [ADR-0004](../adr/0004-use-mastra-for-the-agent-and-metadata-only-tracing.md) · [ADR-0005](../adr/0005-classify-each-message-with-a-topic-router-before-the-tool-agent.md)) and follow it. Do not guess.

## Data delta

No DB changes. (History comes from `loadHistory`, T10; the turn result is saved by the route through `saveTurn`, T25.)

## API contract

Internal: `runTurn({ actor, today, history, message, signal }) → { stream: AsyncIterable<UIMessageChunk>; result: Promise<{ outcome: 'ANSWERED' | 'CAPPED' | 'FAILED'; failure?: 'PROVIDER' | 'SYSTEM'; topic; steps; toolNames; usage; pendingCard?; links: AppLink[]; text }> }` — router (T12) first; `off_topic` → fixed refusal, no tools; otherwise the agent with the read tools (T13), `find_in_app` (T13) and `propose_draft` (T27) in a fixed order, `stopWhen` 8 steps.

## Acceptance criteria

### AC-11b — error

> **Given** a Freelancer with messages left today
> **When** they ask a question that needs more work than one message may use
> **Then** the chat gives the part it found, says plainly that the question was too broad to answer in full, and suggests a narrower one. The message counts toward the allowance.
>
> — `spec.md §5, AC-11b, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — domain invariant

> **Given** an Assistant draft
> **When** the Freelancer asks the chat to send it to the Customer or mark it as issued
> **Then** the chat answers that only they can issue an invoice and links to the draft; the draft stays a draft
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Frozen instructions: scope, plain text and `- ` lists, reply in the message's language, stored text is data, never copy values from earlier invoices, no totals the tools did not return, AC-24 answer for issue/send/edit/delete requests, one card per message — `lib/ai/instructions/chat.ts`
- [ ] Agent definition with the deterministic tool order and the router as input processor; register on `mastra` — `lib/ai/agent.ts`, `lib/ai/mastra.ts`
- [ ] `runTurn`: history (≤ 40), router, agent stream, 8-step cap → `CAPPED` with the "too broad, ask a narrower question" sentence, provider error/429 → `FAILED` + `PROVIDER` — `lib/ai/run-turn.ts`
- [ ] Integration tests with a stub model: endless tool calls stop at 8 → `CAPPED`; 45 stored messages → 40 sent; tool order stable across runs; "send INV-042 to the customer" → only-you-can-issue + invoice link, invoice unchanged; provider 429 → `FAILED`/`PROVIDER` — `tests/integration/lib/ai/run-turn.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Step cap reached mid-answer | partial text + "too broad" sentence, `CAPPED`, counted (AC-11b) |
| Request to issue, send, edit or delete | AC-24 answer + link; no tool can do it |
| "Same as last month" | the agent asks for the values |
| Provider throws after some text streamed | `FAILED`; the route discards and releases (AC-11) |
| Router itself fails | `FAILED`, `SYSTEM` |

## Definition of Done

- [ ] Integration tests with a stub model show runTurn stops at 8 steps and returns the partial answer with outcome CAPPED, sends at most 40 history messages, offers propose_draft and the read tools in a fixed order, answers a request to issue or send with the only-you-can-issue text and an invoice link, and maps a provider error or 429 to a FAILED / AI_UNAVAILABLE result.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
