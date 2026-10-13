---
id: T59
title: "Build the QuestionForm component with every SCR-04 revision state"
layer: "ui"
deps: ["T51", "T53"]
blocks: ["T60"]
acs: ["AC-08b", "AC-12", "AC-13", "AC-38", "AC-40"]
files_hint: ["components/ai/question-form.tsx", "tests/component/"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

# T59 — Build the QuestionForm component with every SCR-04 revision state

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T51 — Add the Question form types and zod schemas, swap choice for form in the chat request, and read legacy offers as one-question forms, T53 — Check typed answers per kind, pin answers into a stored draft request, and compose the answer message · **Blocks:** T60 — Wire QuestionForm into the chat island, send forms, remove OfferedChoices · **Wave:** 4 (longest dependency chain inside T50+).
- **Lane:** shares `tests/component/` with T62 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It is the form the Freelancer fills and sends.

## Inlined context

> States: labels loading · unanswered · partially filled · Other input · field invalid · ready · sending · answered (read-only) · closed (read-only, unanswered) · legacy one-question · refused — unavailable / invalid / used up · failed. Chips are a single-select `role="radiogroup"` of `rounded-full` outline chips; "Other…" reveals the input; Skip for skippable; Send disabled until every required question has a valid answer; per-kind messages in `FieldError`.
>
> — `screens.md §SCR-04 (revision 2026-10-13), abridged` · full text: [screens.md](../screens.md)

> **F8.** Once the Freelancer sends any newer message … earlier forms stay visible, read-only, and show the answers that were sent, if any. Answers chosen but not sent are not saved.
>
> — `spec.md §1, F8, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Props `form: FormView | undefined`, `isLatest`, `pending`, `invoiceCurrency?`, `onSend(formId, answers, composedText)`.

— `screens.md §New components, QuestionForm, abridged` · full text: [screens.md](../screens.md)

## Acceptance criteria

### AC-08b — happy path

> **Given** a Freelancer with Customers Acme Corp and Acme GmbH, and two USD bank accounts on their default sender profile
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the reply holds one form with two questions, the Customer (Acme Corp, Acme GmbH) and the bank account (the two USD accounts); Send stays disabled until both are answered; after one Send the chat shows a draft card for the chosen Customer with the chosen account, and that Send counted as one message
>
> — `spec.md §5, AC-08b, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** a reply with a Question form, after which the Freelancer sent a newer message — either the form itself or a typed message instead
> **When** they look at the earlier reply
> **Then** its form is visible but cannot be changed or sent, and shows the answers that were sent, if any; a form skipped by a typed message shows no answer
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — cross-context

> **Given** a past Conversation in which the chat asked a form with a bank account question of three options and a price question, and the Freelancer sent it with a typed price
> **When** they reopen that Conversation days later
> **Then** the form shows the same three options with the sent one marked and the typed price as sent, and cannot be changed; when the reply was the latest one and its form was never sent, it can still be answered, and a Send naming an account deleted since is turned down with the F7 words, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-38 — happy path

> **Given** a reply whose form asks for the Customer (offering Acme Corp and Acme GmbH and "Other…") and for the price of line 1
> **When** the Freelancer chooses "Other…", types "Оohn  Doe" (a saved Customer, with a Cyrillic "О"), types "40" as the price, and presses Send
> **Then** the Customer is matched from their typed words like a typed message and the draft card shows "Оohn  Doe" at 40.00; had they typed "forty" or "-5" as the price, the form would have shown under that question that a positive amount is needed, Send would have stayed disabled, and nothing would have been sent or counted
>
> — `spec.md §5, AC-38, verbatim` · full text: [spec.md](../spec.md)

### AC-40 — domain invariant

> **Given** a reply whose form has three questions, two of them answered
> **When** the Freelancer looks at the form, and then types a message in the message box instead and sends it
> **Then** Send stays disabled while a required question is unanswered; the typed message is sent as a normal typed message, the form becomes read-only with no answer, and the two picked answers are not saved
>
> — `spec.md §5, AC-40, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] component per the SCR-04 revision wireframes, reusing `Button`, `Input`, `Textarea`, `Field`/`FieldError`, the editor date picker, `Skeleton`
- [ ] per-kind checks from T53 (shared module)
- [ ] component tests for every state row

## Edge cases

| Case | Behaviour |
|---|---|
| Escape in an Other input | hides it and clears its text |
| label longer than the row | truncates, full text in `title` |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] component tests pass for every state
- [ ] a11y: radiogroup arrow keys, `aria-invalid`, `aria-describedby`
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T59`
