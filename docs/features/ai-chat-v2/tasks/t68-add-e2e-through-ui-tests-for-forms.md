---
id: T68
title: "Add e2e-through-UI tests for forms, Markdown, aligned layout, stable skeletons and list-keeping switches, and retake Linux baselines"
layer: "tests"
deps: ["T60", "T62", "T67"]
blocks: []
acs: ["AC-08", "AC-08b", "AC-13", "AC-37", "AC-40", "AC-42", "AC-50", "AC-51", "AC-52", "AC-53"]
files_hint: ["e2e/", "e2e/__screenshots__/"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

# T68 — Add e2e-through-UI tests for forms, Markdown, aligned layout, stable skeletons and list-keeping switches, and retake Linux baselines

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T60 — Wire QuestionForm into the chat island, send forms, remove OfferedChoices, T62 — Render replies as safe Markdown with react-markdown 10.1.0 and remark-gfm 4.0.1 and an in-app link allowlist, T67 — Align the list top row with the chat header, size every skeleton to its content, and level the avatar with the first line · **Blocks:** — · **Wave:** 9 (longest dependency chain inside T50+).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It proves the revision in the real browser.

## Inlined context

> AC-50 equal bottom y at 768 × 1024 and 1440 × 900 · AC-51 boxes ≤ 1 px with a delayed server, layout shift ≤ 0.01 · AC-52 0 list requests, same list node, scroll and search kept · AC-53 avatar middle within 1 px · forms: answer and Send to a card, reopen read-only, typed message closes a half-filled form.
>
> — `test-plan.md §Revision 2026-10-13 — AC coverage, abridged` · full text: [test-plan.md](../test-plan.md)

> **Hard rule:** e2e runs locally before ship (no e2e in CI): check `docker info`, keep the machine awake, clean leaked testcontainers.
>
> — `tasks/_epic.md §Risks / Hard rules, verbatim`

> **Hard rule (owner, 2026-10-13):** existing AC tests stay green and are never weakened; a test of a superseded AC is rewritten for the new behaviour, never deleted silently.
>
> — `tasks/_epic.md §Decisions, D-15, verbatim`

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

### AC-13 — cross-context

> **Given** a past Conversation in which the chat asked a form with a bank account question of three options and a price question, and the Freelancer sent it with a typed price
> **When** they reopen that Conversation days later
> **Then** the form shows the same three options with the sent one marked and the typed price as sent, and cannot be changed; when the reply was the latest one and its form was never sent, it can still be answered, and a Send naming an account deleted since is turned down with the F7 words, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-37 — happy path

> **Given** a Freelancer with four Customers, one sender profile, and no catalogue product "web dev"
> **When** they write "invoice web dev 10 hours, but show me the list of Customers"
> **Then** the reply lists the four Customers and ends with one Question form: a Customer question offering the four Customers and "Other…", and a "Line 1 · Price" question with an input only; it asks nothing it can fill itself (the only sender profile, its default account, today as the issue date) and holds no question in prose. After they answer both and press Send, one message is counted, it shows one line per answer, and the chat shows a draft card with those values
>
> — `spec.md §5, AC-37, verbatim` · full text: [spec.md](../spec.md)

### AC-40 — domain invariant

> **Given** a reply whose form has three questions, two of them answered
> **When** the Freelancer looks at the form, and then types a message in the message box instead and sends it
> **Then** Send stays disabled while a required question is unanswered; the typed message is sent as a normal typed message, the form becomes read-only with no answer, and the two picked answers are not saved
>
> — `spec.md §5, AC-40, verbatim` · full text: [spec.md](../spec.md)

### AC-42 — happy path

> **Given** a Freelancer asking "which invoices are overdue?" with three overdue invoices
> **When** the reply is written and later reopened
> **Then** the answer is shown with its formatting — for example a bulleted list or a table with bold totals — and each invoice number the reply links opens that invoice in the editor; the same formatting shows while it is being written and after reopening
>
> — `spec.md §5, AC-42, verbatim` · full text: [spec.md](../spec.md)

### AC-50 — happy path

> **Given** a Freelancer on a screen 768 px wide or wider with a saved Conversation open
> **When** they look at the top of the workspace
> **Then** the Conversation list's search row and the chat header have the same height, and their bottom borders form one straight line across both panes
>
> — `spec.md §5, AC-50, verbatim` · full text: [spec.md](../spec.md)

### AC-51 — happy path

> **Given** a Freelancer opening the AI section or a Conversation over a slow connection
> **When** the loading placeholders are replaced by the loaded list, header, messages and message box
> **Then** nothing that was already on screen moves: each placeholder had the size and position of what replaced it
>
> — `spec.md §5, AC-51, verbatim` · full text: [spec.md](../spec.md)

### AC-52 — happy path

> **Given** a Freelancer with 40 Conversations who scrolled the list halfway down and typed "inv" into its search
> **When** they pick another Conversation in the list
> **Then** only the chat pane changes and shows a loading state; the list is not loaded again, keeps its scroll position, search text and rows, and marks the picked Conversation as active; the list changes later only when a Conversation is created, renamed or deleted, or when a new message moves a Conversation to the top
>
> — `spec.md §5, AC-52, verbatim` · full text: [spec.md](../spec.md)

### AC-53 — happy path

> **Given** an assistant reply of a single line, and another of several lines
> **When** they are shown
> **Then** each avatar is level with the first line of its message: the avatar's middle and the first line's middle are at the same height
>
> — `spec.md §5, AC-53, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] rewrite the press e2e specs (T30) for forms
- [ ] new specs for layout alignment, skeletons, switching, avatar
- [ ] retake Linux baselines in their own commit after a full local run, each diff inspected

## Edge cases

| Case | Behaviour |
|---|---|
| docker down | not a red of this change (memory rule) |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] full AI e2e suite green locally
- [ ] baselines retaken deliberately
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T68`
