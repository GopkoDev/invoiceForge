---
id: T53
title: "Check typed answers per kind, pin answers into a stored draft request, and compose the answer message"
layer: "domain"
deps: ["T51"]
blocks: ["T56", "T59"]
acs: ["AC-10", "AC-38", "AC-39"]
files_hint: ["lib/services/assistant-drafts/form-pin.ts", "lib/validations/form-answers.ts", "tests/unit/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "done"
---

# T53 — Check typed answers per kind, pin answers into a stored draft request, and compose the answer message

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T51 — Add the Question form types and zod schemas, swap choice for form in the chat request, and read legacy offers as one-question forms · **Blocks:** T56 — Check a sent form before any count and claim or release it with the allowance slot, T59 — Build the QuestionForm component with every SCR-04 revision state · **Wave:** 3 (longest dependency chain inside T50+).
- **Lane:** shares `tests/unit/` with T52 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It turns a set of answers into exact draft values and the one message the Freelancer sees.

## Inlined context

> **F6.** An answer that names a record is put into the draft by the system as exactly that record … A typed "Other…" answer for a record or a currency is treated as the Freelancer's own words … Typed answers are checked for form before sending, per kind: a quantity or a price is a number greater than 0 with at most 2 decimals and at most 8 digits before the point; a tax rate 0–100, ≤ 2 decimals; a discount ≥ 0, ≤ 2 decimals; a date is a real calendar day, and a due date typed in the same form as an issue date is not before it; PO number ≤ 100, payment terms ≤ 200, notes ≤ 2,000, a free answer ≤ 500, a typed record name ≤ 200 … On Send the system applies all draft answers to that stored request and runs the draft action itself; the chat is still called once … Options do not change while the form is filled.
>
> — `spec.md §1, F6, abridged` · full text: [spec.md](../spec.md)

> **F5.** Send is enabled once every required question has an answer. Sending submits all answers as one Freelancer message that counts once toward the Daily message allowance and is refused when the allowance is used up … The message shows one line per answered question, "heading: answer", built by the system from the stored labels and the Freelancer's own typed answers, never from text sent by the browser. Its origin is saved as sent from a form.
>
> — `spec.md §1, F5, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface (the per-kind checks are shared with the browser; their messages are the screens.md SCR-04 revision copy).

## Acceptance criteria

### AC-10 — domain invariant

> **Given** Customers "Acme Corp" and "Аcme Corp" (the second with a Cyrillic "А"), offered as two options of a Customer question
> **When** the Freelancer picks the second option and presses Send
> **Then** each option also shows its Customer's email so the two can be told apart, and the draft continues with exactly the Customer they picked, never the look-alike one
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-38 — happy path

> **Given** a reply whose form asks for the Customer (offering Acme Corp and Acme GmbH and "Other…") and for the price of line 1
> **When** the Freelancer chooses "Other…", types "Оohn  Doe" (a saved Customer, with a Cyrillic "О"), types "40" as the price, and presses Send
> **Then** the Customer is matched from their typed words like a typed message and the draft card shows "Оohn  Doe" at 40.00; had they typed "forty" or "-5" as the price, the form would have shown under that question that a positive amount is needed, Send would have stayed disabled, and nothing would have been sent or counted
>
> — `spec.md §5, AC-38, verbatim` · full text: [spec.md](../spec.md)

### AC-39 — happy path

> **Given** today is 13 October 2026 in the Freelancer time zone and a reply whose form asks for the issue date and the due date
> **When** the Freelancer picks "Yesterday" and "14 days after the issue date" and presses Send
> **Then** the options showed "Yesterday · 12 Oct 2026" and "14 days after the issue date", and the draft card shows the issue date 12 October 2026 and the due date 26 October 2026
>
> — `spec.md §5, AC-39, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] isomorphic `checkAnswerFormat(question, answer)` with the F6 per-kind rules and the SCR-04 messages — `lib/validations/form-answers.ts` (no `server-only`)
- [ ] `pinAnswers(request, questions, answers)`: picks → ids (`customerId` replaces `customer`, `senderProfileId`, bank account id, currency, `lines[i].productId`), "Other…" record → the typed name, dates → `issueDate`/`dueDate` (`daysAfterIssue` from the final issue date), values → quantity/price/tax/discount, Skip → unset
- [ ] `composeAnswerMessage(questions, answers)`: one "heading: answer" line per answered question, stored labels and typed text only

## Edge cases

| Case | Behaviour |
|---|---|
| "forty", "-5", "0" as a price | format error "Enter a number greater than 0, with at most 2 decimals." |
| due typed before issue typed in the same form | "The due date can't be before the issue date." |
| "Other…" Customer "Оohn  Doe" | `customer: "Оohn  Doe"`, no `customerId` |
| Skip on notes | `notes` unset |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] unit tests pass for every kind and the pin of every field
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T53`
