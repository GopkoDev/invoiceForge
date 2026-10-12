---
id: T13
title: "Turn propose_draft issues into the reply's offer, apply the turn's pins, and stream the data-offer part"
layer: "app"
deps: ["T01", "T10", "T11"]
blocks: ["T14"]
acs: ["AC-08", "AC-09", "AC-14"]
files_hint: ["lib/ai/tools/propose-draft.ts", "lib/ai/run-turn.ts", "lib/ai/turn-context.ts", "lib/ai/stream.ts", "tests/integration/ai-chat-v2-offer-turn.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T13 — Turn propose_draft issues into the reply's offer, apply the turn's pins, and stream the data-offer part

## Place in the sequence

- **Blocked by:** T01 — Spike and build the run-turn seam that starts a chat turn from a pinned resolution, T10 — Build Offered choices from resolver issues and pin a chosen option into a draft request, T11 — Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen
- **Blocks:** T14 — Accept choice, origin and startedFrom in the chat request and run the press path in the chat route
- **Wave:** 5 (longest dependency chain); linear position T13 of T31 for the sequential in-place run.
- **Lane:** shares `lib/ai/run-turn.ts` with T01; `lib/ai/tools/propose-draft.ts` with T09; `lib/ai/run-turn.ts` with T14 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It connects the offer builder to the chat turn, so an ambiguous request ends in buttons the model cannot influence.

## Inlined context

> After every `propose_draft` step, code maps the resolver's typed issue to at most one **offer**: up to 8 options with fixed labels and record references. The offer is stored as a server-side row tied to the reply and streamed as a `data-offer` part. The model's text has no path into an offer, so AC-09 and the stored-text injection case hold by construction.
>
> — `sad.md §4, strategic choice 1, verbatim` · full text: [sad.md](../sad.md)

> **New stream part** `data-offer` (OfferPart): at most one per reply, persistent, by reference only; the island reads the offer's labels and state with `loadConversationCards` after the reply finishes (server-actions.md), as it does for Draft cards (ADR-0001 Neutral).
>
> — `contracts/openapi.yaml, sendChatMessage description, verbatim` · full text: `contracts/openapi.yaml,`

> data: {"type":"data-offer","id":"clx0offer000000000000001","data":{"offerId":"clx0offer000000000000001"}}
>
> — `contracts/openapi.yaml, sendChatMessage 200 example «offer», verbatim` · full text: `contracts/openapi.yaml,`

> else an offer-able issue with 1 to 8 options
>     S->>S: build the offer, open, tied to this reply, with the frozen labels, record references, the slot and the draft request it continues
>     S->>X: write the question around the issue
>     X-->>S: question text, its words never become a button
> else more than 8 options
>     S-->>UI: says how many match and asks for a more exact name, no offer
>
> — `sad.md §6, Flow 6, abridged` · full text: [sad.md](../sad.md)

> The turn's `propose_draft` adapter applies the same pins if the model calls it again.
>
> — `contracts/server-actions.md §Pins, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Writes nothing itself: the pending offer is handed to `saveTurn` (T11) at the end of the turn. The offer id is pre-generated (cuid) so the stream part can carry it.

— `data-model.md §ChoiceOffer, id + messageId notes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- Stream: one `data-offer` part `{ id: offerId, data: { offerId } }` per reply at most, after the text, before `data-outcome`.

— `contracts/openapi.yaml, OfferPart, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-08 — happy path

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the chat asks which Customer they mean and shows two buttons, "Acme Corp" and "Acme GmbH", under its reply; pressing "Acme GmbH" sends that choice as their message and the chat continues with a draft card for Acme GmbH
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a reply asking the Freelancer to choose among accounts, where the model's text names an account that is not among the options the draft action found
> **When** the reply is shown
> **Then** the Offered choices show only the options the draft action found; no button ever offers an option the system did not find, whatever the reply's words say
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** a Freelancer with 12 Customers whose names contain "Studio"
> **When** they write "invoice Studio for 3 days at 450 EUR a day"
> **Then** the chat shows no buttons, says that 12 Customers match, and asks them to type a more exact name
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] In the `propose_draft` adapter: on `DRAFT_ISSUES`, call `offerFromIssues`; keep the first offer of the turn as `pendingOffer` (id pre-generated, request = the resolved request); on `TOO_MANY`, add the count to the tool result for the model; apply the turn's pins to any re-call — `lib/ai/tools/propose-draft.ts`, `lib/ai/turn-context.ts`
- [ ] `TurnResult.pendingOffer` and the `data-offer` emission after text — `lib/ai/run-turn.ts`, `lib/ai/stream.ts`
- [ ] Pass `pendingOffer` and the pre-generated `assistantMessageId` into `saveTurn` from the existing route call (typed path only here) — `lib/ai/run-turn.ts`
- [ ] Integration with the scripted model: "invoice Acme for 20 hours at $50" → one open offer tied to the reply, stream carries its id, no card (AC-08); scripted text naming another account → offer equals builder output (AC-09); 12 "Studio" Customers → no offer row, count 12 in the tool result (AC-14); pinned turn + re-call with "Acme Corp" → pin wins — `tests/integration/ai-chat-v2-offer-turn.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Model calls `propose_draft` twice with different issues | Only the first offer of the turn is kept (one choice per reply) |
| Turn ends with a card and an issue | Card wins; no offer |
| Provider failure | No offer stored, nothing closed |
| Issue kind with no offer (value to type, link) | Text only, no `data-offer` part |

## Definition of Done

- [ ] A drafting turn whose resolver issue is offer-able returns a pending offer built by offerFromIssues, streams one data-offer part with only its offerId after the text, a TOO_MANY issue gives the model the match count and no offer, and a re-called propose_draft inside a pinned turn keeps the pinned record, proven by integration tests with the scripted model.
- [ ] integration tests green
- [ ] existing chat-route and propose-draft tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
