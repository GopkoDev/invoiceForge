---
id: T07
title: "Make list_customers look-alike aware with a 20-row page, and add the cross-read contract and timing tests"
layer: "app"
deps: ["T03", "T06"]
blocks: ["T09", "T31"]
acs: ["AC-03", "AC-05", "AC-06", "AC-07"]
files_hint: ["lib/assistant-tools/customers.ts", "lib/services/customers/customers.ts", "tests/contract/ai-chat-v2-read-questions.contract.test.ts", "tests/integration/ai-chat-v2-customers-read.test.ts", "tests/integration/ai-chat-v2-read-timing.test.ts", "tests/contract/mcp-tools-list.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T07 — Make list_customers look-alike aware with a 20-row page, and add the cross-read contract and timing tests

## Place in the sequence

- **Blocked by:** T03 — Move foldName into an isomorphic shared helper with one look-alike fixture set, T06 — Add the list_products read question with prices per currency and a Customer's Custom prices
- **Blocks:** T09 — Rewrite the chat instructions for the real reads and add the own-sender-profile hint on CUSTOMER_NOT_FOUND (AC-05b), T31 — Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility
- **Wave:** 3 (longest dependency chain); linear position T07 of T31 for the sequential in-place run.
- **Lane:** own lane.

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

It completes the three reads: Customers are found despite spacing and look-alike letters, and every read is proven never to leak a full account number.

## Inlined context

> Input and output SHAPES are unchanged (mcp-server ListCustomersInput / CustomersAnswer). Behaviour:
> (1) the `name` filter is folded (shared foldName, ADR-0004) — a superset of today's case-insensitive
> match; (2) `pageSize` is capped at 20 instead of 50 (`pageInfo.pageSizeCapped = true` above 20), default
> 20 as before; `rows` holds at most 20. See ListCustomersInputV2 / CustomersAnswerV2.
>
> — `contracts/openapi.yaml, x-mcp-tools list_customers change, verbatim` · full text: `contracts/openapi.yaml,`

> `customers` (`list_customers`) behaviour changes for MCP clients: folded substring over the current names **and** the names copied onto invoices (as today), and at most 20 rows per answer instead of 50 (spec §1) | Low | Same input/output shape; the description is updated.
>
> — `sad.md §11, risk row list_customers, abridged` · full text: [sad.md](../sad.md)

> Bank account exposure | 0 full account numbers in any read answer, chat reply or MCP answer | contract test over every read question's output
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

> New read questions, response time p95 | ≤ 800 ms server-side for a Freelancer with 20 sender profiles, 500 products and 2,000 Customers | integration test timing + per-tool spans
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

> Integration timing on every PR: each read on the heavy fixture, repeated 50 times, p95 ≤ 800 ms.
>
> — `test-plan.md §NFR validation, verbatim` · full text: [test-plan.md](../test-plan.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Read-only: `Customer` (`name`, `email`, details) and the Customer names copied onto invoices. No schema change, no name index (ADR-0004).

— `data-model.md §Indexes, closing note, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `list_customers` (changed, compatible): input `ListCustomersInputV2`, output `CustomersAnswerV2`; `pageSize` default 20, capped at 20 (`pageSizeCapped`), `pageInfo.total`. Description updated.
- `tools/list`: 10 entries (7 reads + `create_draft_invoice` + `list_sender_profiles` + `list_products`).

— `contracts/openapi.yaml, x-mcp-tools list_customers, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-03 — happy path

> **Given** a Customer saved as "Оohn  Doe" with a Cyrillic "О" and two spaces
> **When** the Freelancer asks the chat about "oohn doe"
> **Then** the chat finds that Customer and answers about it, showing its name exactly as saved
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

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

- [ ] Fold the name filter with the shared `foldName` over current and invoice-copied names; cap at 20 — `lib/services/customers/customers.ts`
- [ ] Update the tool's `pageSize` description and the output description ("At most 20 per page") — `lib/assistant-tools/customers.ts`
- [ ] Integration: AC-03 "Оohn  Doe"; "Globex" → empty, total 0 (AC-05); foreign Customers invisible (AC-07); 25 matches → 20 rows + total 25 — `tests/integration/ai-chat-v2-customers-read.test.ts`
- [ ] Contract: every read question's output against the openapi schemas; serialized answers contain none of the seeded full account numbers; the look-alike fixture set gives the same matches through chat adapter and MCP; `tools/list` has the 10 tools — `tests/contract/ai-chat-v2-read-questions.contract.test.ts`
- [ ] Timing: heavy Freelancer (20 profiles, 500 products, 2,000 Customers), each read 50×, p95 ≤ 800 ms — `tests/integration/ai-chat-v2-read-timing.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `pageSize: 50` from an existing MCP client | 20 rows, `pageSizeCapped = true`, no error |
| Name matches only a name copied onto an invoice | Still found (as today) |
| Look-alike query | Matches; the answer shows the saved name verbatim |
| Timing test on a slow machine | Measure server-side time only; skip cleanly without a container |

## Definition of Done

- [ ] list_customers finds "Оohn  Doe" from "oohn doe" with its saved name, caps a page at 20 with pageInfo.total, a contract test walks every read question's output and finds none of the seeded full account numbers, the tool listing holds the 10 tools, and each new read answers in p95 ≤ 800 ms on the heavy fixture.
- [ ] contract, integration and timing tests green
- [ ] MCP regression tests for list_customers updated to the 20 cap
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
