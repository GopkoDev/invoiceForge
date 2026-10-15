---
id: T69
title: "Register QuestionForm, ConversationListProvider and the Markdown MessageResponse in the design system and update ux-flows for the form"
layer: "docs"
deps: ["T60", "T62", "T66"]
blocks: []
acs: ["AC-08", "AC-42", "AC-52"]
files_hint: ["docs/design-system.md", "docs/features/ai-chat-v2/ux-flows.md"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T69 — Register QuestionForm, ConversationListProvider and the Markdown MessageResponse in the design system and update ux-flows for the form

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T60 — Wire QuestionForm into the chat island, send forms, remove OfferedChoices, T62 — Render replies as safe Markdown with react-markdown 10.1.0 and remark-gfm 4.0.1 and an in-app link allowlist, T66 — Keep the Conversation list mounted in the AI layout and update it from chat events · **Blocks:** — · **Wave:** 9 (longest dependency chain inside T50+).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** everything the chat still needs asked at once in one Question form, with options I can press, an "Other…" input where my answer is not offered, and one Send
> **So that** I choose the exact Customer, account, product, profile, currency or date without retyping, answer all open questions in one message, and never pick an option the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It keeps the canon and the flows true to the built components.

## Inlined context

> | `QuestionForm` … | to register (docs/design-system.md) by the implementing task | `ConversationListProvider` … | `MessageResponse` (changed) | update the registry row |
>
> — `screens.md §New components, abridged` · full text: [screens.md](../screens.md)

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

### AC-42 — happy path

> **Given** a Freelancer asking "which invoices are overdue?" with three overdue invoices
> **When** the reply is written and later reopened
> **Then** the answer is shown with its formatting — for example a bulleted list or a table with bold totals — and each invoice number the reply links opens that invoice in the editor; the same formatting shows while it is being written and after reopening
>
> — `spec.md §5, AC-42, verbatim` · full text: [spec.md](../spec.md)

### AC-52 — happy path

> **Given** a Freelancer with 40 Conversations who scrolled the list halfway down and typed "inv" into its search
> **When** they pick another Conversation in the list
> **Then** only the chat pane changes and shows a loading state; the list is not loaded again, keeps its scroll position, search text and rows, and marks the picked Conversation as active; the list changes later only when a Conversation is created, renamed or deleted, or when a new message moves a Conversation to the top
>
> — `spec.md §5, AC-52, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] design-system rows with contracts as built; `OfferedChoices` row marked removed
- [ ] ux-flows US-03 flow: form instead of single press; note on persistent list switching

## Edge cases

| Case | Behaviour |
|---|---|
| contract differs from screens.md | fix the screens row in the same commit |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] docs updated; links resolve
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T69`
