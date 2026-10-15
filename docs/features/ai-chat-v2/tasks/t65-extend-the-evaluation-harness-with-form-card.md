---
id: T65
title: "Extend the evaluation harness with form, card-or-form, link and date checks and the owner-feedback rows"
layer: "tests"
deps: ["T60", "T63", "T64"]
blocks: []
acs: ["AC-37", "AC-45", "AC-46", "AC-47", "AC-48", "AC-49"]
files_hint: ["evals/assistant/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T65 — Extend the evaluation harness with form, card-or-form, link and date checks and the owner-feedback rows

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T60 — Wire QuestionForm into the chat island, send forms, remove OfferedChoices, T63 — Tell the model today and the time zone, and rewrite the chat instructions and router wording for forms, search-first and links, T64 — Add created-date filters, a created-date sort and in-app paths to search_invoices on both channels · **Blocks:** — · **Wave:** 9 (longest dependency chain inside T50+).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to understand dates like "yesterday", search my Customers and products before asking, draft or ask with a form when I ask for an invoice, link to my invoices, and find invoices by when they were created
> **So that** a request in my own words leads to a draft without a round of questions I have to answer in prose
>
> — `spec.md §4, US-14, verbatim` · full text: [spec.md](../spec.md)

It measures the model behaviour the owner asked for, on the real model.

## Inlined context

> | Chat behaviour (model) | each eval row of the drafting-behaviour set (dates, form instead of prose, search before "add one", invoice links, created-in-month query) passes in ≥ 4 of 5 runs against the configured model | eval suite run before ship (not in CI) |
>
> — `spec.md §6, row «Chat behaviour (model)», verbatim` · full text: [spec.md](../spec.md)

> Rows `form-not-prose-uk`, `form-not-prose-en`, `single-profile-not-asked`, `yesterday-date`, `search-before-add`, `link-to-draft`, `last-draft-january`; setups `four-customers-one-profile`, `+product-web-development`, `draft-inv-0042`, `drafts-january`; scorer `expect: "form"`, `"card-or-form"`, link check, date check.
>
> — `test-plan.md §Revision 2026-10-13 — evaluation fixtures, abridged` · full text: [test-plan.md](../test-plan.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-37 — happy path

> **Given** a Freelancer with four Customers, one sender profile, and no catalogue product "web dev"
> **When** they write "invoice web dev 10 hours, but show me the list of Customers"
> **Then** the reply lists the four Customers and ends with one Question form: a Customer question offering the four Customers and "Other…", and a "Line 1 · Price" question with an input only; it asks nothing it can fill itself (the only sender profile, its default account, today as the issue date) and holds no question in prose. After they answer both and press Send, one message is counted, it shows one line per answer, and the chat shows a draft card with those values
>
> — `spec.md §5, AC-37, verbatim` · full text: [spec.md](../spec.md)

### AC-45 — happy path

> **Given** today is 13 October 2026 in the Freelancer's time zone (Europe/Kyiv) and a Customer "My New Customer" exists
> **When** they write "create an invoice for web dev services for my new customer, 176 hours, dated yesterday"
> **Then** the chat drafts with the issue date 12 October 2026 (or asks only for what is still missing with a Question form); it never asks which date "yesterday" is
>
> — `spec.md §5, AC-45, verbatim` · full text: [spec.md](../spec.md)

### AC-46 — happy path

> **Given** a Freelancer who asks to create or issue an invoice and leaves out values the draft needs (the Customer, the price, or the sender profile among several)
> **When** the chat replies
> **Then** the reply is a draft card or a Question form asking for exactly the missing values; it never lists questions in prose, and it never asks for a value it can find itself (a single sender profile, the default bank account, a Customer the Freelancer named)
>
> — `spec.md §5, AC-46, verbatim` · full text: [spec.md](../spec.md)

### AC-47 — happy path

> **Given** a Freelancer with a Customer "My New Customer" and a catalogue product "Web development"
> **When** they write "invoice my new customer for web development, 10 hours"
> **Then** the chat finds both by searching before replying and uses them; it tells the Freelancer to add a Customer or product only after a search for that name found nothing (AC-05)
>
> — `spec.md §5, AC-47, verbatim` · full text: [spec.md](../spec.md)

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

- [ ] dataset type + setups + rows
- [ ] scorer rules and a `--runs 5` pass-rate (≥ 4/5)
- [ ] harness unit tests for the scorer

## Edge cases

| Case | Behaviour |
|---|---|
| reply with a "- " list of questions and no form | fails `expect: form` |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] harness unit tests pass
- [ ] one local run recorded in the commit message (owner gate before ship)
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T65`
