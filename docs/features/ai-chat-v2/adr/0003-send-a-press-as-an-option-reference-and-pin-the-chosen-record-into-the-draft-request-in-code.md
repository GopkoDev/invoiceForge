---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0003 — Send a press as an option reference and pin the chosen record into the draft request in code

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

A press must be told apart from typed text. It must refer to exactly the option pressed and never be re-matched by name (spec §1 "A pressed choice is exact", AC-10). A press that cannot be applied must be turned down before it is processed: it never reaches the model, is not counted, marks nothing, and gets the same words for every cause (AC-12b, AC-13). A valid press is an ordinary counted message (AC-11). Today the chat route accepts one text message per request, and the model re-states the request to `propose_draft` in words. This was ux-flows design input (1). SAD §4 seed 2, §5.

## Decision drivers

- Spec §6 "Look-alike name search … 100 %" and AC-10: a look-alike pair must never swap.
- Spec §6.1 abuse case "Forged choice": another Freelancer's record is answered as if it does not exist.
- ai-assistant ADR-0009: the allowance reservation is the first counted step, and anything checked before it is free.
- Keep a single message path, so that streaming, history, persistence and the allowance stay as they are.

## Considered options

1. **An option reference on the chat request, pinned by code.**
   - The request carries `choice: { offerId, optionId }`.
   - The route checks it against the Freelancer's own latest `OPEN` offer, and the record against current data, before reserving.
   - It then claims the offer with the slot and saves the stored label as the message with origin `PRESSED`.
   - It pins the record id into the offer's stored draft request, runs the resolver in code, and lets the model write the reply around that result.
   - The turn's `propose_draft` adapter applies the same pins if the model calls it again.
2. **A record-id reference** (`{ offerId, kind, recordId }`), checked by the route against the record ids stored in the offer.
3. **A separate server action for a press** that resolves the choice outside the chat stream and then sends a follow-up chat message.

## Decision outcome

**Chosen:** Option 1. Exactness then does not depend on name matching or on the model. Re-sending the label as typed text is ruled out by spec §1 ("a press is told apart from typed text"), so every option sends a structured reference. Option 2 is as exact, but it accepts a record id from the browser and has to compare it against the stored set. That widens what a forged request can probe, and an id that only differs in its owner must still be answered uniformly. An option id inside a stored offer cannot name another Freelancer's record at all. Option 3 splits one counted message across two calls: either the allowance is checked twice, or a press can resolve without being counted. It also duplicates the persistence and streaming path.

## Consequences

**Positive**
- Every invalid press (unknown, foreign, older, closed, deleted or no longer fitting) ends in one `CHOICE_UNAVAILABLE` outcome with zero model calls and no counter change. This is testable at the route.
- The card or next offer after a press is decided by code, so the pressed record is the one on the card.
- The server sets the message origin; a client cannot claim `PRESSED`.

**Negative**
- `chatRequestSchema` and the route grow a second branch (contract change, recorded by `api`).
- The resolver request gains `senderProfileId` (bank accounts and products already take ids).
- Starting a turn from a pre-resolved result needs a Mastra-specific message shape. This is a §11 risk, with a fallback.
- Claim and release join the slot's reserve and release: one more thing to undo on failure.

**Neutral**
- A valid press with no allowance left is refused like a typed message and claims nothing (AC-11). An invalid press is refused as unavailable even when the allowance is used up.

## Links

- Spec: [[../spec.md]] §1, AC-08, AC-08b, AC-10, AC-11, AC-12, AC-12b, AC-13; §6.1
- SAD: [[../sad.md]] §4, §5, §6 flow 1, §8
- Related ADR: [[0001-store-each-set-of-offered-choices-as-a-server-side-offer-row-tied-to-its-reply]], [[0002-build-offered-choices-in-code-from-the-draft-resolvers-typed-issues]]; ai-assistant ADR-0006, ADR-0009
