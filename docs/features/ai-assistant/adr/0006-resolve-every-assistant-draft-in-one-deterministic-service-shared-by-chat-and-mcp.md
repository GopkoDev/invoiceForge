---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0006 — Resolve every Assistant draft in one deterministic service shared by chat and MCP

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Every value on an Assistant draft must come from the request or from the defaults the editor applies to a new invoice (`newInvoiceDefaults` in `lib/services/invoices/editor-data.ts`), and anything else must be asked (chat) or refused (MCP). The spec fixes the rules: name matching by case-insensitive containment, currency symbols, words win over the catalogue, custom prices, the default sender profile and its bank account per currency, issue date today in the Freelancer time zone and due 30 days later, quantity 1 and unit "item" defaults, and naming every default used. External Assistants have no orchestrator of their own, so the guard must live inside the action.

## Decision drivers

- Spec §6: 100 % of incomplete or ambiguous draft requests end in a question (chat) or a refusal (MCP); 0 drafts carry a value from neither the request nor the editor defaults — verified by a contract test of the draft action.
- Spec §6.1: the no-guessing guard runs inside the draft action itself, so it holds for both channels.
- AC-12, AC-16–AC-22, AC-30, AC-31.

## Considered options

1. **Model extracts, code resolves** — the model fills a strict structured request with the Freelancer's own words (or exact ids an external Assistant found through the read tools); `resolveDraftRequest(actor, request)` in `lib/services/assistant-drafts/` does matching, defaults and the guard and returns `needs` (questions, with the candidates named) or a proposal whose every value carries its source.
2. **Model resolves through the read tools** — the model looks up Customers and products itself and passes final ids and values; the service only checks presence.
3. **A separate extraction call** — a dedicated structured-output call turns the message into the request before the agent, then the resolver runs.

## Decision outcome

**Chosen:** Option 1. Only deterministic code can prove "no value from neither the request nor the defaults", and one service is the same rule for the chat and for MCP. Option 2 lets the model apply the matching rules non-deterministically and leaves the service unable to tell a guessed value from a stated one; option 3 adds a model call per drafting message for what the strict tool schema already gives.

## Consequences

**Positive**
- The contract test exercises the resolver directly with fixture requests, without a model.
- The chat card and the MCP answer list the same defaults with the same wording.

**Negative**
- The structured request schema is a new contract (shared by the chat tool and the MCP tool) that must evolve compatibly.
- The resolver reads sender profiles, bank accounts, Customers, products and custom prices; it must reuse the invoice service's own rules (currency invariant, default profile and account) rather than re-implement them.

**Neutral**
- The resolver never writes; creation stays in the invoice service (ADR-0007 for the chat path).

## Links

- Spec: [[../spec.md]] §1 (defaults, matching, currency symbols), §6, §6.1, AC-12–AC-22, AC-30, AC-31
- SAD: [[../sad.md]] §4, §5, §6
- Related ADR: [[0007-store-draft-cards-server-side-and-create-only-from-a-create-server-action]]
