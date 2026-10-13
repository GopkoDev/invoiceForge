---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0001 — Store each set of Offered choices as a server-side offer row tied to its reply

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

An Offered choice must be shown again when a Conversation is reopened (spec §1, AC-13). Only the latest reply's options may be pressed (AC-12), and a press must be checked against exactly the options stored for that reply (AC-12b). A press also has to be claimed atomically, because two presses on one reply are possible, and it has to be released when the turn fails. The first iteration stores message parts as JSONB (ai-assistant ADR-0008) and keeps Draft cards as lockable server-side rows (ai-assistant ADR-0007). SAD §4 seed 1, §5.

## Decision drivers

- Spec §6 "Offered choices: 100 % of buttons match options the draft action found", and the forged-choice abuse case (spec §6.1).
- A press is claimed with the allowance slot and released on a system-side failure (SAD §5), so it needs a lockable state.
- Export, 90-day retention and account deletion must cover the offered and chosen options (AC-34) with the existing Conversation cascade.
- Reuse the Draft-card precedent (ai-assistant ADR-0007) instead of inventing a second pattern.

## Considered options

1. **A `ChoiceOffer` row per offering reply.** It holds the owner, Conversation, reply message, kind, slot, stored draft request, options JSON, state (`OPEN` / `CHOSEN` / `CLOSED`) and chosen option. A partial unique index allows one `OPEN` offer per Conversation, and the row cascades with the Conversation.
   - A press claims by moving `OPEN` → `CHOSEN`; a non-counted failure releases it `CHOSEN` → `OPEN`.
   - A newer typed or dashboard message moves `OPEN` → `CLOSED`.
2. **Inside the reply's JSONB parts**: a `data-offer` part with the options, and the chosen option written back into the part (or onto the pressed user message).
3. **Extend the `DraftCard` table** with an "offer" state and an options column.

## Decision outcome

**Chosen:** Option 1. A row gives one place to lock and claim a press, a queryable "latest open offer" check, and a state for the inactive and chosen display. It is the same shape as ai-assistant ADR-0007. Option 2 would need a JSONB read-modify-write on a message row for every press, with no index for "the open offer of this Conversation", and the stored draft request would sit inside the visible message parts. Option 3 mixes two lifecycles (a proposal to create versus a question to answer) in one table, with state values that mean different things.

## Consequences

**Positive**
- The press check, the claim and its release are single-row conditional updates.
- Reopening renders offers from rows (state and chosen mark) without parsing message history.
- Retention and account deletion need no new step, because the rows cascade with the Conversation.

**Negative**
- One more table owned by the Conversation, and one more set of rows in the export.
- The stored draft request is kept until the Conversation is purged. It holds the Freelancer's own words, which are already in the visible messages.

**Neutral**
- The message part holds only the offer id. The UI gets labels and state from the row view, as it does for cards.

## Links

- Spec: [[../spec.md]] §1 "Offered choices as buttons", AC-08–AC-14, AC-34
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-build-offered-choices-in-code-from-the-draft-resolvers-typed-issues]], [[0003-send-a-press-as-an-option-reference-and-pin-the-chosen-record-into-the-draft-request-in-code]]; ai-assistant ADR-0007, ADR-0008

## As built (review 2026-10-13)

The life cycle of Option 1 as implemented: a non-counted failure releases `CHOSEN` → `OPEN`, or → `CLOSED` when a newer message was saved meanwhile (another tab), so an older reply's buttons never become pressable again (R1-B2, R2-B1). Any newer message closes an `OPEN` offer, a press included (its own offer is already `CHOSEN`, so it closes only an offer another tab stored).
