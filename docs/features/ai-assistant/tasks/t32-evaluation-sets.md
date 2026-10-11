---
id: T32
title: "Add the labelled topic-boundary set and the no-guessing set as a Mastra evaluation run that blocks a failing change"
layer: "tests"
deps: ["T29"]
blocks: []
acs: ["AC-06", "AC-06b"]
files_hint: ["evals/assistant/topic-boundary.jsonl", "evals/assistant/no-guessing.jsonl", "evals/assistant/run.ts", "package.json"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T32 — Add the labelled topic-boundary set and the no-guessing set as a Mastra evaluation run that blocks a failing change

## Place in the sequence

- **Blocked by:** T29 — Define the chat agent: instructions, tool set, 8-step cap, 40-message history and the turn runner the route calls · **Blocks:** nothing — a leaf of the graph · **Wave:** 7 — needs the full agent; gates release and every instruction change.
- **Lane:** shares `package.json` with T04 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to help with my own data, my drafts and finding things in the app, and to tell me briefly when something is outside that
> **So that** I know what it is for and never mistake it for tax or legal advice
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task measures the topic boundary and the no-guessing guard before release and on every instruction or model change, so a regression blocks the change instead of reaching Freelancers.

## Inlined context

> | Topic boundary accuracy | ≥ 95 % of off-topic questions refused and ≤ 5 % of in-scope questions refused, on a fixed labelled set of ≥ 100 questions | evaluation run before release and on every change to the Assistant's instructions |
> | No-guessing guard | 100 % of incomplete or ambiguous draft requests in the evaluation set end in a question (chat) or a refusal (MCP); 0 drafts carry a value from neither the request nor the editor defaults | evaluation set + contract test of the draft action |
>
> — `spec.md §6, NFR rows, verbatim` · full text: [spec.md](../spec.md)

> **When:** the labelled question set is run before release and on every change to the Assistant's instructions or model setting. **Then:** "≥ 95 % of off-topic questions refused and ≤ 5 % of in-scope questions refused, on a fixed labelled set of ≥ 100 questions". **How verify:** a Mastra evaluation run of the topic router and agent over the labelled set; a failing run blocks the change.
>
> — `sad.md §10, QG-3 second scenario, abridged` · full text: [sad.md](../sad.md)

> **Model quality on Flash-Lite.** The boundary (≥ 95 % / ≤ 5 %) or the extraction into `propose_draft` may fall short on the smallest model. | Medium | The evaluation run blocks release. Fallback: a Flash model via `AI_CHAT_MODEL`, which lowers the free-tier ceiling.
>
> — `sad.md §11, risk row 6, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Message text in fixtures is the spec's own example wording, never copied from real data.
>
> — `data-model.md §Test fixtures, PII guard, abridged` · full text: [data-model.md](../data-model.md)

The eval calls the real model (`AI_CHAT_MODEL` through the gateway) against a seeded throwaway database; it is a local / pre-release gate, not part of the per-task unit gate (no model calls in CI).

**Fallback:** insufficient or contradicted by the code → read the named file in full ([sad.md](../sad.md) · [ADR-0005](../adr/0005-classify-each-message-with-a-topic-router-before-the-tool-agent.md) · the pinned Mastra version's evals docs) and follow it. Do not guess.

## Data delta

No DB changes. The run seeds a throwaway database with the spec's fixtures (Acme Corp, Acme GmbH, Consulting 50 USD / 45 USD custom price, USD + EUR accounts).

## API contract

Internal — no API surface. Script: `pnpm eval:assistant` → exit code 0 only when every threshold holds; prints per-label precision and the failing items.

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

- [ ] Labelled topic set, ≥ 100 lines (`{ text, label: in_scope | mixed | off_topic, lang }`), English and Ukrainian, including the spec's examples (VAT, logo, Acme paid this year) — `evals/assistant/topic-boundary.jsonl`
- [ ] No-guessing set: every incomplete/ambiguous request of AC-16b, AC-17, AC-19–AC-22 plus complete controls (AC-12, AC-16, AC-19 complete) — `evals/assistant/no-guessing.jsonl`
- [ ] Runner: router verdicts → off-topic refused ≥ 95 %, in-scope refused ≤ 5 %; agent runs → incomplete ends in a question (no `pendingCard`), and every pending proposal value has a source — `evals/assistant/run.ts`
- [ ] `eval:assistant` script — `package.json`

## Edge cases

| Case | Behaviour |
|---|---|
| `mixed` items | count as in-scope for the ≤ 5 % rule (the in-scope part must be answered) |
| Provider rate-limits the run | retry with backoff inside the runner; a run that cannot finish fails, never passes |
| Threshold missed | non-zero exit with the failing items listed |

## Definition of Done

- [ ] pnpm eval:assistant runs ≥ 100 labelled questions through the router and agent and exits non-zero unless ≥ 95 % of off-topic ones are refused and ≤ 5 % of in-scope ones are refused, and runs the no-guessing set to 100 % questions for incomplete or ambiguous requests with 0 proposals carrying a value from neither the request nor the defaults.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
