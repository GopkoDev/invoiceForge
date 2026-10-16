---
id: T06
title: "Add the list_products read question with prices per currency and a Customer's Custom prices"
layer: "app"
deps: ["T03", "T05"]
blocks: ["T07"]
acs: ["AC-02", "AC-05", "AC-06", "AC-07"]
files_hint: ["lib/assistant-tools/products.ts", "lib/assistant-tools/index.ts", "lib/services/products/products.ts", "lib/ai/tools/read-tools.ts", "tests/integration/ai-chat-v2-products-read.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T06 — Add the list_products read question with prices per currency and a Customer's Custom prices

## Place in the sequence

- **Blocked by:** T03 — Move foldName into an isomorphic shared helper with one look-alike fixture set, T05 — Add the list_sender_profiles read question for the chat and MCP, and fix the stale MCP read-only comment
- **Blocks:** T07 — Make list_customers look-alike aware with a 20-row page, and add the cross-read contract and timing tests
- **Wave:** 2 (longest dependency chain); linear position T06 of T31 for the sequential in-place run.
- **Lane:** shares `lib/ai/tools/read-tools.ts` with T05 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to find my sender profiles with their bank accounts, my products with their prices, and my Customers even when I misspace or mix look-alike letters
> **So that** I can draft under another profile, in another currency or with a catalogue product without leaving the chat
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As an** Assistant
> **I want** the same sender-profile, product and Customer reads through a Personal key
> **So that** the Freelancer's own AI client can prepare correct draft requests without guessing ids or names
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

It lets the chat answer what a product costs, including the Custom price agreed with a named Customer.

## Inlined context

> Lists the Freelancer's active catalogue products, optionally filtered by part of a name (ignoring letter
> case, extra spaces and letters that look the same in Latin and Cyrillic). Each row is one product in one
> currency with its standard price; a product sold in several currencies appears once per currency. Pass a
> `customerId` taken from a `list_customers` answer to also get that Customer's Custom price per product.
> At most 20 rows per page; `pageInfo.total` says how many matched in all.
>
> — `contracts/openapi.yaml, x-mcp-tools list_products description, verbatim` · full text: `contracts/openapi.yaml,`

> **The reads search by name.** The Customer search and the product read both take a name and match it ignoring case, extra spaces and look-alike letters, like the draft action; the product read without a name lists the catalogue. Each answer holds at most 20 records and says how many matched in all. The Customer for custom prices is named by its id from a Customer search answer.
>
> — `spec.md §1, interview decisions, verbatim` · full text: [spec.md](../spec.md)

> alt the Customer id for custom prices is not this Freelancer's
>     S-->>C: answers as for a Customer that does not exist, no hint about other accounts
> else nothing matches
>     S-->>C: no records, total zero
>
> — `sad.md §6, Flow 5, abridged` · full text: [sad.md](../sad.md)

> One `foldName` … for the resolver, the three reads and the title search.
>
> — `sad.md §8, Name matching row, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Read-only: `Product` (active, `name`, `unit`, prices per currency) and `CustomPrice` (by `customerId` + product). No schema change.

— `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

## API contract

- Tool `list_products`: input `ListProductsInput` (`name?`, `customerId?`, paging), output `ProductsAnswer` (rows `{ productId, name, unit, currency, price, customPrice? }`, `pageInfo.total`), page ≤ 20. Span `assistant-tools.products`.

— `contracts/openapi.yaml, x-mcp-tools list_products + ProductsAnswer, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-02 — happy path

> **Given** a catalogue product "Consulting" priced 50 USD and 45 EUR, with a custom price of 40 USD agreed with Acme Corp
> **When** the Freelancer asks the chat what "Consulting" costs for Acme Corp
> **Then** the chat answers with 50.00 USD and 45.00 EUR as the standard prices and 40.00 USD as the custom price agreed with Acme Corp, each figure exactly as stored
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — error

> **Given** a Freelancer with no Customer matching "Globex" and no catalogue product matching "audit"
> **When** they ask the chat to find the Customer "Globex" or the product "audit"
> **Then** the chat says plainly that nothing matches and links to the page where they can add one; it never names a record that does not exist
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy path

> **Given** a Personal key without Draft permission
> **When** its Assistant asks for the Freelancer's sender profiles, products, or Customers matching a name
> **Then** it gets the same answers the chat gets, including record ids it can name in a draft request, and no full bank account number
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — authorization

> **Given** two Freelancers, where only the second has a sender profile "Globex Ltd" and a product "Audit"
> **When** the first Freelancer's chat or Personal key asks for sender profiles or products
> **Then** the answers hold only the first Freelancer's records, with no hint that the other records exist
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Service `listProductsForAssistant(actor, input)`: owner rows, fold filter in the app, ≤ 20 + total, Custom prices joined only for an owned `customerId` — `lib/services/products/products.ts`
- [ ] Tool definition + handler + span; register after `list_sender_profiles` — `lib/assistant-tools/products.ts`, `lib/assistant-tools/index.ts`
- [ ] Integration test: AC-02 fixture ("Consulting" 50 USD / 45 EUR, 40 USD for Acme Corp) as stored decimals; "audit" → no rows, total 0 (AC-05); second Freelancer's "Audit" invisible and their customerId answered as unknown (AC-07); MCP answer equals chat answer (AC-06) — `tests/integration/ai-chat-v2-products-read.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| No name given | Lists the catalogue, first 20, total |
| Archived product | Not listed |
| `customerId` of another Freelancer | Same answer as an unknown id, no hint |
| Product priced in two currencies | One row per currency |
| More than 20 matches | 20 rows, `pageInfo.total` = all matches |

## Definition of Done

- [ ] list_products answers a folded name filter with at most 20 rows plus the total, each figure exactly as stored, adds Custom prices only for a customerId owned by the acting Freelancer, and answers a foreign customerId exactly as an unknown one, proven by integration tests on both channels.
- [ ] integration tests green on both channels
- [ ] figures equal the stored decimals
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
