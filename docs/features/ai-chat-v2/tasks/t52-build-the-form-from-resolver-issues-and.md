---
id: T52
title: "Build the form from resolver issues and compose one form per reply (order, cap 6, dedupe, input-only above 8, date options)"
layer: "domain"
deps: ["T51"]
blocks: ["T54", "T55"]
acs: ["AC-08", "AC-08b", "AC-14", "AC-39", "AC-41"]
files_hint: ["lib/services/assistant-drafts/forms.ts", "tests/unit/"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "done"
---

# T52 — Build the form from resolver issues and compose one form per reply (order, cap 6, dedupe, input-only above 8, date options)

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T51 — Add the Question form types and zod schemas, swap choice for form in the chat request, and read legacy offers as one-question forms · **Blocks:** T54 — Add the chat-only ask_user tool that checks every named record owner-scoped and by kind and builds the labels, T55 — Compose the turn's one form, stream it, store it in saveTurn and return FormView on reopen · **Wave:** 3 (longest dependency chain inside T50+).
- **Lane:** shares `lib/services/assistant-drafts/forms.ts`, `tests/unit/` with T51, T53, T54, T56 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It decides, in code, which questions a reply asks and with which options and labels.

## Inlined context

> **F1.** One Question form per reply … up to 6 questions shown together … answered with one **Send**. A reply has at most one form. A reply with a draft card has no form. When more than 6 questions are open, the form keeps the first 6 in this order — Customer, sender profile, bank account, currency, products (by line), issue date, due date, quantities and prices (by line), the other values, free questions — and the rest are asked in the next form after Send.
>
> — `spec.md §1, F1, abridged` · full text: [spec.md](../spec.md)

> **F3.** A question about a record or a currency may offer up to 8 options … the chat may also put a question of its own into the form and name the records to offer, by the record ids its reads returned. The system checks every named record before the form is shown: it must be the Freelancer's own and of the asked kind … If any named record fails the check, no form is shown from that request … in the same words whether the record belongs to another Freelancer or never existed … If the turn ends without a valid form, the system shows a form with the same questions as inputs only … every option label is built by the system from the stored record … a date question offers fixed options computed by the system in the Freelancer time zone when the form is made: "Today" and "Yesterday" … due date "7/14/30 days after the issue date", counted from the issue date the draft ends up with.
>
> — `spec.md §1, F3, abridged` · full text: [spec.md](../spec.md)

> `propose_draft` ISSUES → `formFromIssues` builds a question for every issue (offer-able ones with options as in the ADR-0002 table; value issues such as `LINE_PRICE_MISSING_IN_CURRENCY` as input-only questions; more than 8 candidates → input-only with `matchCount`) … the form is the resolver questions of the last `propose_draft` ISSUES followed by the `ask_user` questions whose `field`+`lineIndex` the resolver did not already ask, capped at 6 in the spec §1 F1 order … fallback form with the asked fields as input-only questions … Optional fields carry a Skip answer. A card wins.
>
> — `adr/0011, Decision outcome, abridged` · full text: [ADR-0011](../adr/0011-ask-every-open-question-in-one-server-checked-question-form-answered-with-one-send.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-08 — happy path

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the reply ends with a Question form whose Customer question offers "Acme Corp" and "Acme GmbH" and an "Other…" choice; after they pick "Acme GmbH" and press Send, their message reads "Customer: Acme GmbH" and the chat continues with a draft card for Acme GmbH
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-08b — happy path

> **Given** a Freelancer with Customers Acme Corp and Acme GmbH, and two USD bank accounts on their default sender profile
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the reply holds one form with two questions, the Customer (Acme Corp, Acme GmbH) and the bank account (the two USD accounts); Send stays disabled until both are answered; after one Send the chat shows a draft card for the chosen Customer with the chosen account, and that Send counted as one message
>
> — `spec.md §5, AC-08b, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** a Freelancer with 12 Customers whose names contain "Studio"
> **When** they write "invoice Studio for 3 days at 450 EUR a day"
> **Then** the reply's form asks for the Customer with no option buttons, says that 12 Customers match, and offers only the input for a more exact name; a name typed there and sent is matched like a typed message
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-39 — happy path

> **Given** today is 13 October 2026 in the Freelancer time zone and a reply whose form asks for the issue date and the due date
> **When** the Freelancer picks "Yesterday" and "14 days after the issue date" and presses Send
> **Then** the options showed "Yesterday · 12 Oct 2026" and "14 days after the issue date", and the draft card shows the issue date 12 October 2026 and the due date 26 October 2026
>
> — `spec.md §5, AC-39, verbatim` · full text: [spec.md](../spec.md)

### AC-41 — domain invariant

> **Given** a drafting request for which the draft action finds a draft card
> **When** the reply is shown
> **Then** it shows the draft card and no Question form; and a reply never holds more than one form
>
> — `spec.md §5, AC-41, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `formFromIssues(issues, { invoiceCurrency, today, timeZone })` reusing the existing label rules of `offers.ts` (look-alike email / "no email")
- [ ] `dateOptions(field, today, timeZone)`: issue Today/Yesterday as absolute dates with "· 12 Oct 2026" labels; due `daysAfterIssue` 7/14/30
- [ ] `composeForm(resolver, chat, { fallback })`: order, dedupe by field+lineIndex (resolver wins), cap 6, questionIds renumbered 0..n-1
- [ ] headings per field ("Customer", "Line 1 · Price", …) as app text
- [ ] unit tests from test-plan rows AC-08, AC-08b, AC-14, AC-39, AC-41

## Edge cases

| Case | Behaviour |
|---|---|
| 9 open questions | first 6 by the F1 order |
| 12 matching Customers | question with no options, matchCount 12, input TEXT |
| `BANK_ACCOUNT_CURRENCY_MISMATCH` | a BANK_ACCOUNT question offering the profile's accounts in the draft currency; input-only when there are none |
| no offer-able and no value issue | no form |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] unit tests pass, including the 9-question ordering and the date options with a fixed clock in Europe/Kyiv
- [ ] the old `offerFromIssues` unit tests are rewritten for questions (not deleted)
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T52`
