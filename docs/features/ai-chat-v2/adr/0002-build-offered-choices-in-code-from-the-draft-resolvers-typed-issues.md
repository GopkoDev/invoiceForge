---
status: Superseded by 0011
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-13"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0002 — Build Offered choices in code from the draft resolver's typed issues

- **Status:** Superseded by 0011 (2026-10-13, owner feedback: Question form)
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

The buttons must never offer an option that the draft action did not find, whatever the reply's words say (AC-09). A stored note must never be able to place a button (spec §6.1 abuse case "Prompt injection into options"). `resolveDraftRequest` already returns a closed union of `DraftIssue` kinds, and most of them carry record candidates with ids: Customers, products and bank accounts. Sender-profile options are names today. Spec §1 fixes one choice per reply, at most 8 buttons, and fixed labels per kind. SAD §4 seed 1, §5.

## Decision drivers

- Spec §6 "0 buttons from model text", contract-tested with an injection fixture.
- Spec §1 "One choice at a time", "At most 8 buttons per reply" and "What a button shows".
- Model cost per message p95 ≤ USD 0.02, unchanged (spec §6). No extra model step should be needed to show buttons.

## Considered options

1. **Code maps the issue to an offer.** After each `propose_draft` step, `offerFromIssue(issue)` picks the first offer-able issue in a fixed order (Customer → sender profile → currency → bank account → product). It builds at most 8 options with labels from the stored records and stores the offer. More than 8 options means no offer; the count goes to the model as a fact to say.
2. **The model calls an `offer_choices` tool** naming record ids and labels, and code validates each against the latest resolver issue before storing.

## Decision outcome

**Chosen:** Option 1. The safety property then holds by construction, not by validation: the model has no input into what is offered, the injection test reduces to "offers equal `offerFromIssue(issue)`", and no model step or tokens are spent. Option 2 can be made safe by validation, but the model can still omit, reorder or relabel options, and drop the call entirely. It also adds a step to every choosing reply and a second schema to keep in sync with the issue union.

## Consequences

**Positive**
- One deterministic mapping, unit-tested per issue kind. The labels match spec §1, including the email on look-alike Customers.
- The model writes only the question around the buttons. Its text and the buttons cannot contradict each other in a way that changes what is pressed.

**Negative**
- The resolver's issue schema grows (contract change, recorded by `api`) so that every label comes from the issue itself:
  - Customer candidates carry the email;
  - bank-account candidates carry the bank name, last four digits and currency;
  - product candidates carry the unit and the price in the invoice currency;
  - `SENDER_PROFILE_NOT_FOUND` carries profile ids beside the names.
- The priority order is a product rule in code. Changing it later is a code change.

**Neutral**
- Issue kinds that ask for a value to type, or that send the Freelancer elsewhere with a link, never produce an offer, per spec §1. SAD §5 lists every kind of the union.

## Links

- Spec: [[../spec.md]] §1, AC-08, AC-08b, AC-09, AC-10, AC-14; §6.1 abuse cases
- SAD: [[../sad.md]] §4, §5, §8 "Untrusted text"
- Related ADR: [[0001-store-each-set-of-offered-choices-as-a-server-side-offer-row-tied-to-its-reply]]; ai-assistant ADR-0006
