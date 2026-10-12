---
id: T01
title: "Spike and build the run-turn seam that starts a chat turn from a pinned resolution"
layer: "app"
deps: []
blocks: ["T13"]
acs: ["AC-10"]
files_hint: ["lib/ai/run-turn.ts", "lib/ai/agent.ts", "lib/ai/turn-context.ts", "tests/integration/ai-chat-v2-pinned-turn.test.ts", "docs/features/ai-chat-v2/sad.md"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T01 — Spike and build the run-turn seam that starts a chat turn from a pinned resolution

## Place in the sequence

- **Blocked by:** nothing (can start first)
- **Blocks:** T13 — Turn propose_draft issues into the reply's offer, apply the turn's pins, and stream the data-offer part
- **Wave:** 1 (longest dependency chain); linear position T01 of T31 for the sequential in-place run.
- **Lane:** shares `lib/ai/run-turn.ts` with T13; `lib/ai/run-turn.ts` with T14 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It removes the one framework risk SAD §11 names before any press code is written: a press must reach the model with its record already resolved by code.

## Inlined context

> Feeding a pre-resolved result into a Mastra turn (as a prior tool step) may need framework-specific message shapes | Medium | Spike it in the first `implement` task. Fallback: pass the result as a structured system note for the turn and emit the card or offer parts from the route; the safety property does not depend on the model.
>
> — `sad.md §11, risk row «pre-resolved result into a Mastra turn», verbatim` · full text: [sad.md](../sad.md)

> The chosen record id is pinned into the offer's stored draft request, and the resolver runs in code. The model then writes the reply around that result, so it cannot re-match the record by name (AC-10).
>
> — `sad.md §4, strategic choice 2, verbatim` · full text: [sad.md](../sad.md)

> C->>S: pin the chosen record into the stored draft request and resolve it
> S-->>C: a Draft card, or the next single offer, or a question
> C->>A: run the turn with the pinned result already in its context
> A->>G: write the reply around the result
> …
> else system-side failure before the reply completes
>     C->>S: release the slot and the claim (chosen back to open), save only the turn metadata
>
> — `sad.md §6, Critical flow 1 «option valid» branch, abridged` · full text: [sad.md](../sad.md)

> The turn's `propose_draft` adapter applies the same pins if the model calls it again.
>
> — `contracts/server-actions.md §Chat route internals, Pins, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> Chosen: Option 1. Exactness then does not depend on name matching or on the model.
>
> — `adr/0003 §Decision outcome, abridged` · full text: [adr/0003](../adr/0003-send-a-press-as-an-option-reference-and-pin-the-chosen-record-into-the-draft-request-in-code.md)

> Code today: `runTurn(input: RunTurnInput)` with `{ actor, today, history, message, signal, origin? }`; `TurnResult.pendingCard?: { id, request, proposal }`; the agent is `chatAgent` from `lib/ai/agent.ts`, streamed through Mastra with a `RequestContext` keyed by `TURN_CONTEXT_KEY`.
>
> — `lib/ai/run-turn.ts, RunTurnInput / TurnResult, abridged` · full text: `lib/ai/run-turn.ts,`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-10 — domain invariant

> **Given** Customers "Acme Corp" and "Аcme Corp" (the second with a Cyrillic "А"), offered as two buttons
> **When** the Freelancer presses the second button
> **Then** each button also shows its Customer's email so the two can be told apart, and the draft continues with exactly the Customer they pressed, never the look-alike one
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Read how `runTurn` builds the model messages and the `RequestContext` turn context — `lib/ai/run-turn.ts`, `lib/ai/turn-context.ts`
- [ ] Approach A (preferred): add `pinned?: { request: DraftRequest; resolution: DraftResolution }` to `RunTurnInput`; when present, append a synthetic assistant `propose_draft` tool-call + tool-result pair carrying the resolution to the messages the agent receives — `lib/ai/run-turn.ts`
- [ ] Write the test first: scripted model, a hand-built `DraftRequest` with a `customerId` resolved by `resolveDraftRequest`; assert the scripted model's recorded prompt holds the tool result and `TurnResult.pendingCard.proposal` equals the pinned proposal — `tests/integration/ai-chat-v2-pinned-turn.test.ts`
- [ ] If Mastra or the AI SDK message conversion rejects or strips the synthetic tool messages: switch to fallback B — a structured system note (the resolution as JSON, data-only) added for this turn, with the card or next-offer parts emitted from `pinned` by the route, not by the tool — same test file
- [ ] Carry `pins` (the pinned request) in the turn context so T13's `propose_draft` adapter can re-apply them on a re-call — `lib/ai/turn-context.ts`
- [ ] Record the outcome in the Mitigation cell of the §11 row: «Spiked in T01: approach A (prior tool step)» or «… fallback B (system note)» — `docs/features/ai-chat-v2/sad.md`

## Edge cases

| Case | Behaviour |
|---|---|
| Pinned resolution is an issue (the next offer), not a proposal | No `pendingCard`; the issue is in the model's context; T13 builds the offer from it |
| Scripted model calls `propose_draft` again with other words | The turn context exposes the pins; T13 makes the pins win (AC-10) |
| Provider fails during a pinned turn | `TurnResult.outcome = 'FAILED'`, `failure = 'PROVIDER'`, unchanged from today, so T14 can release slot and claim |
| Approach A works only for some providers | Prefer fallback B — the safety property must not depend on the model or the provider |

## Definition of Done

- [ ] An integration test with the scripted model shows runTurn started from a pinned PROPOSAL returns that proposal as its pending card without a second name match, the model's input carries the pinned result, and the approach taken (prior tool step or the documented system-note fallback) is recorded in sad.md §11.
- [ ] the pinned-turn integration test passes on a throwaway database with the scripted model
- [ ] `RunTurnInput` without `pinned` behaves exactly as before (existing run-turn tests green)
- [ ] sad.md §11 records which approach was taken and why
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
