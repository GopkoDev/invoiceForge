---
id: T64
title: "Add created-date filters, a created-date sort and in-app paths to search_invoices on both channels"
layer: "app"
deps: []
blocks: ["T63", "T65"]
acs: ["AC-48", "AC-49"]
files_hint: ["lib/services/invoices/assistant-search.ts", "lib/assistant-tools/search.ts", "tests/integration/", "tests/contract/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T64 — Add created-date filters, a created-date sort and in-app paths to search_invoices on both channels

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** — · **Blocks:** T63 — Tell the model today and the time zone, and rewrite the chat instructions and router wording for forms, search-first and links, T65 — Extend the evaluation harness with form, card-or-form, link and date checks and the owner-feedback rows · **Wave:** 1 (longest dependency chain inside T50+).
- **Lane:** shares `tests/contract/`, `tests/integration/` with T58 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to understand dates like "yesterday", search my Customers and products before asking, draft or ask with a form when I ask for an invoice, link to my invoices, and find invoices by when they were created
> **So that** a request in my own words leads to a draft without a round of questions I have to answer in prose
>
> — `spec.md §4, US-14, verbatim` · full text: [spec.md](../spec.md)

It lets "the last draft created in January" be answered and linked.

## Inlined context

> **F12.** When the Freelancer asks to create, issue or prepare an invoice, the chat drafts it (a draft card) or asks with a Question form; it never answers with a list of questions in prose. Before saying that a named Customer or product does not exist, or telling the Freelancer to add one, it searches for it. It may link to the Freelancer's invoices and drafts … Its invoice search can filter by status and by the day the invoice was created, and sort by the day created.
>
> — `spec.md §1, F12, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes (reads the existing `Invoice.createdAt`; no index, per data-model §Revision «Invoice — no change»).

## API contract

- `search_invoices` input adds `createdFrom`, `createdTo` (calendar days, Freelancer time zone, inclusive), `sort: issueDate | createdAt` (default issueDate, newest first); rows add `createdAt` (local day) and `path` (`/invoices/{id}/edit`).

— `contracts/openapi.yaml, SearchInvoicesInputDelta/SearchInvoicesRowDelta, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-48 — happy path

> **Given** a Freelancer with a Draft invoice INV-0042 created in the chat
> **When** they ask "give me a link to that draft"
> **Then** the reply holds a link "INV-0042" that opens that draft in the editor; the chat never says it cannot give links to invoices
>
> — `spec.md §5, AC-48, verbatim` · full text: [spec.md](../spec.md)

### AC-49 — happy path

> **Given** today is 13 October 2026, and the Freelancer has three Draft invoices created on 5, 20 and 28 January 2026 (the last with an issue date in February) and one created in February 2026
> **When** they ask "the last draft created in January"
> **Then** the chat answers with the draft created on 28 January 2026 and links it; it does not answer that none exists
>
> — `spec.md §5, AC-49, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] service filters + sort in the owner-scoped query
- [ ] tool schema + descriptions (both channels)
- [ ] integration test with drafts created 5, 20, 28 Jan and 3 Feb 2026; contract test of the row delta

## Edge cases

| Case | Behaviour |
|---|---|
| createdFrom after createdTo | VALIDATION |
| no sort | unchanged behaviour (issue date) |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] integration + contract tests pass
- [ ] existing search tests unchanged and green
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T64`
