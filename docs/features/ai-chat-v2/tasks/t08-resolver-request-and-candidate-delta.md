---
id: T08
title: "Extend the draft resolver: senderProfileId in the request and label fields on the issue candidates"
layer: "domain"
deps: ["T03"]
blocks: ["T09", "T10"]
acs: ["AC-04", "AC-10"]
files_hint: ["lib/services/assistant-drafts/schema.ts", "lib/services/assistant-drafts/resolve-parties.ts", "lib/services/assistant-drafts/resolve-lines.ts", "lib/services/assistant-drafts/resolve.ts", "tests/integration/ai-chat-v2-resolver-delta.test.ts", "tests/contract/ai-chat-v2-draft-shapes.contract.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T08 — Extend the draft resolver: senderProfileId in the request and label fields on the issue candidates

## Place in the sequence

- **Blocked by:** T03 — Move foldName into an isomorphic shared helper with one look-alike fixture set
- **Blocks:** T09 — Rewrite the chat instructions for the real reads and add the own-sender-profile hint on CUSTOMER_NOT_FOUND (AC-05b), T10 — Build Offered choices from resolver issues and pin a chosen option into a draft request
- **Wave:** 2 (longest dependency chain); linear position T08 of T31 for the sequential in-place run.
- **Lane:** shares `lib/services/assistant-drafts/resolve-parties.ts` with T03; `lib/services/assistant-drafts/resolve-parties.ts` with T09 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to find my sender profiles with their bank accounts, my products with their prices, and my Customers even when I misspace or mix look-alike letters
> **So that** I can draft under another profile, in another currency or with a catalogue product without leaving the chat
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It gives the resolver everything an Offered choice needs to label and pin a record, and lets a draft name its sender profile by id.

## Inlined context

> ADDITIVE. The parent DraftRequest plus `senderProfileId` (ADR-0003 Negative). At most one of
> `senderProfile` / `senderProfileId`; both → VALIDATION ("Give at most one of senderProfile and
> senderProfileId."). An id that is not one of the Freelancer's sender profiles →
> `SENDER_PROFILE_NOT_FOUND` with `written` = the id, worded as for a name that matches nothing (AC-07).
>
> — `contracts/openapi.yaml, DraftRequestDelta, abridged` · full text: `contracts/openapi.yaml,`

> - `CUSTOMER_AMBIGUOUS` / `CUSTOMER_NEAR_MISS` `.candidates[]` → CustomerCandidate (+ `email`);
> - `SEVERAL_ACCOUNTS_IN_CURRENCY` / `BANK_ACCOUNT_NOT_FOUND` / `BANK_ACCOUNT_AMBIGUOUS` `.accounts[]`
>   → BankAccountCandidate (+ `bankName`, `lastFour`, `currency`);
> - `PRODUCT_AMBIGUOUS` `.candidates[]` → ProductCandidate (+ `unit`, `price`, `currency`);
> - `SENDER_PROFILE_NOT_FOUND` → + `profiles[]` (SenderProfileRef) beside the existing `options` names.
> No other kind changes.
>
> — `contracts/openapi.yaml, DraftIssueDelta, verbatim` · full text: `contracts/openapi.yaml,`

> ProductCandidate.price: The rate the resolver would use: the Customer's Custom price when one exists, else Product.price.
>
> — `contracts/openapi.yaml, ProductCandidate, verbatim` · full text: `contracts/openapi.yaml,`

> Applies to the chat, the Create press (NEEDS_ANSWERS) and MCP DRAFT_ISSUES alike.
>
> — `contracts/openapi.yaml, DraftIssueDelta, verbatim` · full text: `contracts/openapi.yaml,`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `create_draft_invoice` / chat `propose_draft` input: `DraftRequestDelta` (+ `senderProfileId`).
- `DRAFT_ISSUES` details: `DraftIssueDelta` candidate shapes (`CustomerCandidate`, `BankAccountCandidate`, `ProductCandidate`, `SenderProfileRef[]`).

— `contracts/openapi.yaml, DraftRequestDelta + DraftIssueDelta, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-04 — cross-context

> **Given** a Freelancer whose default sender profile has only a USD account, and whose other sender profile "Consulting FOP" has a UAH account
> **When** they ask the chat to draft an invoice for Acme Corp in UAH under "Consulting FOP"
> **Then** the draft card uses "Consulting FOP" and its UAH account and names both as taken from the request, under the same draft rules as the first iteration
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant

> **Given** Customers "Acme Corp" and "Аcme Corp" (the second with a Cyrillic "А"), offered as two buttons
> **When** the Freelancer presses the second button
> **Then** each button also shows its Customer's email so the two can be told apart, and the draft continues with exactly the Customer they pressed, never the look-alike one
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `senderProfileId` with the at-most-one refinement; extend the candidate zod shapes — `lib/services/assistant-drafts/schema.ts`
- [ ] Resolve `senderProfileId` owner-scoped (unknown/foreign → `SENDER_PROFILE_NOT_FOUND` worded as a name); fill the new candidate fields; product candidate `price` is the rate the resolver would use — `resolve-parties.ts`, `resolve-lines.ts`, `resolve.ts`
- [ ] Integration: AC-04 ("Consulting FOP", UAH) with source labels; both `senderProfile` and `senderProfileId` → VALIDATION; foreign id → not found — `tests/integration/ai-chat-v2-resolver-delta.test.ts`
- [ ] Contract: proposal and issue shapes match openapi; candidate shapes have no full account number field — `tests/contract/ai-chat-v2-draft-shapes.contract.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Both `senderProfile` and `senderProfileId` | `VALIDATION` "Give at most one of senderProfile and senderProfileId." |
| Another Freelancer's `senderProfileId` | `SENDER_PROFILE_NOT_FOUND` worded as for a name that matches nothing |
| Customer with no email | Candidate `email: null` |
| Existing MCP clients without the new fields | Unchanged behaviour (additive) |

## Definition of Done

- [ ] DraftRequest accepts senderProfileId (at most one of senderProfile and senderProfileId), Customer candidates carry email, bank-account candidates bank name, last four and currency, product candidates unit, price and currency, SENDER_PROFILE_NOT_FOUND carries profiles[], and an integration test drafts AC-04 under "Consulting FOP" with its UAH account marked as taken from the request.
- [ ] integration + contract tests green
- [ ] existing resolver and MCP draft tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
