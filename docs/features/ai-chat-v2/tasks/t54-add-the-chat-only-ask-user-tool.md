---
id: T54
title: "Add the chat-only ask_user tool that checks every named record owner-scoped and by kind and builds the labels"
layer: "app"
deps: ["T52"]
blocks: ["T55", "T63"]
acs: ["AC-09", "AC-37"]
files_hint: ["lib/ai/tools/ask-user.ts", "lib/ai/agent.ts", "lib/services/assistant-drafts/forms.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "done"
---

# T54 — Add the chat-only ask_user tool that checks every named record owner-scoped and by kind and builds the labels

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T52 — Build the form from resolver issues and compose one form per reply (order, cap 6, dedupe, input-only above 8, date options) · **Blocks:** T55 — Compose the turn's one form, stream it, store it in saveTurn and return FormView on reopen, T63 — Tell the model today and the time zone, and rewrite the chat instructions and router wording for forms, search-first and links · **Wave:** 4 (longest dependency chain inside T50+).
- **Lane:** shares `lib/services/assistant-drafts/forms.ts` with T51, T52, T56 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It lets the chat ask its own questions while every option stays one of the Freelancer's records with a system label.

## Inlined context

> **F3.** A question about a record or a currency may offer up to 8 options … the chat may also put a question of its own into the form and name the records to offer, by the record ids its reads returned. The system checks every named record before the form is shown: it must be the Freelancer's own and of the asked kind … If any named record fails the check, no form is shown from that request … in the same words whether the record belongs to another Freelancer or never existed … If the turn ends without a valid form, the system shows a form with the same questions as inputs only … every option label is built by the system from the stored record … a date question offers fixed options computed by the system in the Freelancer time zone when the form is made: "Today" and "Yesterday" … due date "7/14/30 days after the issue date", counted from the issue date the draft ends up with.
>
> — `spec.md §1, F3, abridged` · full text: [spec.md](../spec.md)

> The server loads every `recordIds` entry owner-scoped and by the question's kind (CUSTOMER → Customer, SENDER_PROFILE → SenderProfile, BANK_ACCOUNT → a BankAccount of one of the actor's profiles, PRODUCT → Product) … Any failing id → the whole call answers `{ ok: false, error: OPTIONS_UNAVAILABLE }` with the same words for a foreign and an unknown id; nothing is stored.
>
> — `contracts/openapi.yaml, AskUserInput, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Hard rule:** Owner-scoped everything: another Freelancer's offer, card, Conversation or record answers exactly as one that does not exist.
>
> — `tasks/_epic.md §Risks / Hard rules, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Tool `ask_user` (chat agent only, not MCP): input `AskUserInput { draft?, questions[1..6] { field, lineIndex?, prompt ≤ 140, recordIds? ≤ 8, currencies?, optional? } }`; answer `AskUserAnswer` `{ ok: true, shown, say }` | `{ ok: false, error: OPTIONS_UNAVAILABLE }`.

— `contracts/openapi.yaml, AskUserInput/AskUserAnswer, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-09 — domain invariant

> **Given** a reply asking the Freelancer to choose among accounts, where the model's text names an account that is not among the options the draft action found, and where the chat also tries to offer, by id, a bank account that belongs to another Freelancer
> **When** the reply is shown
> **Then** the form offers only the Freelancer's own records that the system checked, each labelled from the stored record; no option ever comes from the reply's words, no option shows another Freelancer's account, and no label differs from the system's label for that record
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-37 — happy path

> **Given** a Freelancer with four Customers, one sender profile, and no catalogue product "web dev"
> **When** they write "invoice web dev 10 hours, but show me the list of Customers"
> **Then** the reply lists the four Customers and ends with one Question form: a Customer question offering the four Customers and "Other…", and a "Line 1 · Price" question with an input only; it asks nothing it can fill itself (the only sender profile, its default account, today as the issue date) and holds no question in prose. After they answer both and press Send, one message is counted, it shows one line per answer, and the chat shows a draft card with those values
>
> — `spec.md §5, AC-37, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `checkAskUser(actor, input, ctx)` in `forms.ts`: owner-scoped loads by kind, labels via the shared label rules, the partial draft validated (ids re-checked)
- [ ] tool `ask_user` writes the checked questions into the turn context (T55 composes); registered on the chat agent only
- [ ] integration tests: foreign id and unknown id → identical answer, nothing stored; valid call → questions with server labels

## Edge cases

| Case | Behaviour |
|---|---|
| id of another Freelancer's Customer | OPTIONS_UNAVAILABLE, same words as unknown |
| bank account id of another profile of the same Freelancer | accepted |
| MCP tool listing | no ask_user |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] integration tests pass on a throwaway database with the scripted model
- [ ] MCP listing contract test unchanged
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T54`
