---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0007 — Store Draft cards server-side and create only from a Create server action

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

In the chat, a draft exists only after the Freelancer presses Create on the card the chat showed. The card must be rebuilt from the same request and current data at every press (AC-18), pressing twice or replaying a press creates nothing new (AC-14), a newer card replaces every earlier one in the Conversation (AC-14b), a press works with no messages left because it is not a message (AC-11c), and text stored in the Freelancer's data must never become a request (AC-15).

## Decision drivers

- Spec §6: 0 drafts created by the chat without the Freelancer's press; draft created after the press ≤ 2 s p95 server-side.
- Spec §6.1: prompt injection through stored data is the sharpest abuse case.
- AC-11c, AC-13, AC-14, AC-14b, AC-18, AC-36.

## Considered options

1. **Server-side card rows** — `propose_draft` stores the structured request, the resolved content and a content fingerprint as a Draft card (status `live` / `replaced` / `created`, invoice id once created); the Create press is a server action that locks the card, re-resolves, compares fingerprints and creates in the same transaction.
2. **Signed stateless card** — the card's request and content travel in the message as a signed token; Create verifies the signature and re-resolves; replacement and "already created" are derived from Conversation messages and an origin key on the invoice.

## Decision outcome

**Chosen:** Option 1. A row gives one place to lock against a double press, an explicit `replaced` state for AC-14b and an invoice link for AC-36; option 2 has to rebuild the same state from scanning messages and a unique key on invoices, and a stale signed token stays verifiable forever.

## Consequences

**Positive**
- The model has no create tool at all; the only path to a chat draft is the Freelancer's press on a card id they own.
- A press on an outdated card returns an updated card (status `replaced` on the old one) instead of creating.

**Negative**
- A new table owned by the Conversation (cards go with it on deletion; the drafts they created stay — AC-37).
- The card fingerprint must cover exactly the values the spec lists as making a card outdated (prices, Customer, sender profile, bank account, "today").

**Neutral**
- The MCP path skips cards: it resolves and creates in one call, with its own repeat key (§5).

## Links

- Spec: [[../spec.md]] §6, §6.1, AC-11c, AC-13–AC-15, AC-18, AC-36, AC-37
- SAD: [[../sad.md]] §4, §5, §6
- Related ADR: [[0006-resolve-every-assistant-draft-in-one-deterministic-service-shared-by-chat-and-mcp]]
