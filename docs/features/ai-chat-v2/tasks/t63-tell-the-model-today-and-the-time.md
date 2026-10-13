---
id: T63
title: "Tell the model today and the time zone, and rewrite the chat instructions and router wording for forms, search-first and links"
layer: "app"
deps: ["T54", "T64"]
blocks: ["T65"]
acs: ["AC-45", "AC-46", "AC-47", "AC-48"]
files_hint: ["lib/ai/run-turn.ts", "lib/ai/instructions/chat.ts", "lib/ai/router.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T63 — Tell the model today and the time zone, and rewrite the chat instructions and router wording for forms, search-first and links

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T54 — Add the chat-only ask_user tool that checks every named record owner-scoped and by kind and builds the labels, T64 — Add created-date filters, a created-date sort and in-app paths to search_invoices on both channels · **Blocks:** T65 — Extend the evaluation harness with form, card-or-form, link and date checks and the owner-feedback rows · **Wave:** 5 (longest dependency chain inside T50+).
- **Lane:** shares `lib/ai/run-turn.ts` with T55, T57 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to understand dates like "yesterday", search my Customers and products before asking, draft or ask with a form when I ask for an invoice, link to my invoices, and find invoices by when they were created
> **So that** a request in my own words leads to a draft without a round of questions I have to answer in prose
>
> — `spec.md §4, US-14, verbatim` · full text: [spec.md](../spec.md)

It removes the behaviour bugs the owner saw (no date, prose questions, no search, no links).

## Inlined context

> **F11.** Every turn tells the chat today's date and weekday and the Freelancer time zone … A month named without a year means its latest occurrence that is not after today … "last <weekday>" means the latest such day before today … A period with no word about which date means the issue date; "created" means the day the invoice was created.
>
> — `spec.md §1, F11, abridged` · full text: [spec.md](../spec.md)

> **F12.** When the Freelancer asks to create, issue or prepare an invoice, the chat drafts it (a draft card) or asks with a Question form; it never answers with a list of questions in prose. Before saying that a named Customer or product does not exist, or telling the Freelancer to add one, it searches for it. It may link to the Freelancer's invoices and drafts … Its invoice search can filter by status and by the day the invoice was created, and sort by the day created.
>
> — `spec.md §1, F12, abridged` · full text: [spec.md](../spec.md)

> `run-turn` adds a per-turn system note (not in the frozen instructions, so the cached prefix stays stable): "Today is {weekday}, {YYYY-MM-DD} in {timeZone}" … The router's `draft` intent also covers "issue", "виставити", "create … invoice" …
>
> — `sad.md §5 «Revision 2026-10-13», Chat behaviour, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** The model has no issuing tool.
>
> — `tasks/_epic.md §Risks / Hard rules, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

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

## Checklist

- [ ] per-turn date note in `run-turn.ts` (unit test with a fixed clock)
- [ ] instructions: drafting → propose_draft or ask_user, never prose questions; search before "add one"; Markdown links with tool `path`s; date rules; remove "Do not use tables … markup" and "Link … by naming them"
- [ ] router SYSTEM: issue/виставити → draft; router fixture unit tests
- [ ] update the instruction unit tests (rewrite, not delete)

## Edge cases

| Case | Behaviour |
|---|---|
| "issue my latest Acme draft" (AC-24) | still the only-you-can-issue answer |
| instructions prefix | byte-identical across turns |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] unit tests pass
- [ ] existing AC-24 / AC-05b tests stay green
- [ ] lint green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T63`
