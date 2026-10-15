---
id: T12
title: "Check a pressed choice against the stored offer and claim or release it with the allowance slot"
layer: "infra"
deps: ["T10", "T11"]
blocks: ["T14"]
acs: ["AC-11", "AC-12b", "AC-13"]
files_hint: ["lib/services/assistant-drafts/offers.ts", "lib/services/assistant-usage/allowance.ts", "tests/integration/ai-chat-v2-choice-check.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Check a pressed choice against the stored offer and claim or release it with the allowance slot

## Place in the sequence

- **Blocked by:** T10 — Build Offered choices from resolver issues and pin a chosen option into a draft request, T11 — Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen
- **Blocks:** T14 — Accept choice, origin and startedFrom in the chat request and run the press path in the chat route
- **Wave:** 5 (longest dependency chain); linear position T12 of T31 for the sequential in-place run.
- **Lane:** shares `lib/services/assistant-drafts/offers.ts` with T10 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It is the server-side gate that makes a press exact and unforgeable before anything is counted or sent to the model.

## Inlined context

> **`checkChoice`** reads `WHERE id = $offerId AND "userId" = $actor AND state = 'OPEN'`, requires `conversationId` to match and the option to exist, then re-reads the option's record owner-scoped and checks it still fits: the Customer, sender profile or product exists (product still active, in the invoice currency); a bank account still belongs to the request's sender profile and is in the request's currency, if one is set; a currency is always valid. Writes nothing. Span `chat.choice-check` (metadata only: outcome, never the cause's data).
>
> — `contracts/server-actions.md §Chat route internals, checkChoice, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Claim (Critical flow 1, step 3):** `UPDATE … SET "state" = 'CHOSEN', "chosenOptionId" = $n WHERE "id" = $offerId AND "userId" = $actor AND "state" = 'OPEN'`, 1 row = claimed, 0 rows = lost the race → unavailable (the slot is released). Same transaction as the allowance slot reservation, and nothing else
>
> — `data-model.md §ChoiceOffer, Claim, verbatim` · full text: [data-model.md](../data-model.md)

> **Release (Critical flow 1, system-side failure):** `UPDATE … SET "state" = 'OPEN', "chosenOptionId" = NULL WHERE "id" = $offerId AND "state" = 'CHOSEN'`.
>
> — `data-model.md §ChoiceOffer, Release, abridged` · full text: [data-model.md](../data-model.md)

> Authorization and tenancy | … A press refers to an offer **option id**, never to a record id, so another Freelancer's record cannot be named. The option's record is re-checked as owned and still fitting at press time. Another Freelancer's offer, Conversation or invoice answers exactly as one that does not exist (AC-12b, AC-22).
>
> — `sad.md §8, Authorization row, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

`ChoiceOffer`: read by PK + `userId` + `state = 'OPEN'`; `UPDATE state/chosenOptionId` for claim and release. `MessageAllowanceDay`: the existing reservation row, now in the same transaction as the claim.

— `data-model.md §ChoiceOffer access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `checkChoice(actor, { conversationId, offerId, optionId }) → { ok: true; offer; option } | { ok: false }`
- `claimOffer(tx, actor, offerId, optionId) → boolean`; `releaseOffer(tx, offerId) → void`
- `{ ok: false }` ⇒ the route answers `409 CONFLICT` + `CHOICE_UNAVAILABLE` (T14).

— `contracts/server-actions.md §Chat route internals, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-11 — domain invariant

> **Given** a Freelancer with one message left today and a reply offering two buttons
> **When** they press a button, and then press an Offered choice in the chat's next reply
> **Then** the first press is sent and counts as a message; the second is not processed, no option of that reply is marked as chosen, and the chat says today's allowance is used up and when it renews, exactly as for a typed message
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12b — authorization

> **Given** a Conversation whose latest reply offered Acme Corp and Acme GmbH
> **When** a message arrives presented as a pressed option for a record that is not among that reply's Offered choices — an option from an older reply, or a Customer of another Freelancer
> **Then** it is never applied as a choice and never reaches the model; it does not count toward the allowance, and the chat says that this option is no longer available, in the same words whether the option was outdated, belongs to another Freelancer or never existed; the draft never moves toward that record
>
> — `spec.md §5, AC-12b, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — cross-context

> **Given** a past Conversation in which the chat offered three bank accounts as buttons and the Freelancer pressed one
> **When** they reopen that Conversation days later
> **Then** the reply shows the same three options, with the pressed one marked as chosen; when the reply was the latest one and nothing was pressed, its buttons can still be pressed, and pressing one whose account has since been deleted is turned down as an option that is no longer available, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `checkChoice` with the record-fit rules per kind and the `chat.choice-check` span (outcome only) — `lib/services/assistant-drafts/offers.ts`
- [ ] `claimOffer` / `releaseOffer`; expose a reserve-and-claim helper that runs the existing slot reservation and the claim in one transaction, releasing the slot when the claim returns false — `offers.ts`, `lib/services/assistant-usage/allowance.ts`
- [ ] Integration: each `{ ok: false }` cause (unknown, foreign, other Conversation, CLOSED, CHOSEN, missing option, deleted account, account in another currency, archived product, deleted profile); currency always ok; two concurrent claims → exactly one true and the loser's slot released; no slot left → nothing claimed (AC-11); `checkChoice` changes no row — `tests/integration/ai-chat-v2-choice-check.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Offer of another Freelancer | `{ ok: false }`, same as never existed |
| Offer of another Conversation of the same Freelancer | `{ ok: false }` |
| Record deleted or moved to another currency since | `{ ok: false }` (AC-13) |
| Allowance used up with a valid option | Reservation fails; nothing claimed; offer stays `OPEN` |
| Release on an offer that is not `CHOSEN` | No-op |

## Definition of Done

- [ ] checkChoice returns ok only for an OPEN offer of the acting Freelancer in that Conversation whose option exists and whose record still exists, is owned and still fits, claimOffer moves OPEN to CHOSEN in the same transaction as the slot reservation and returns false on a lost race, releaseOffer moves CHOSEN back to OPEN, and checkChoice writes nothing, all proven by integration tests.
- [ ] integration tests green, including the concurrent claim
- [ ] span carries outcome only
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
