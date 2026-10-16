---
id: T30
title: "Add e2e-through-UI tests for presses, reopen, full-height layout, empty start, phone sheets and streaming"
layer: "tests"
deps: ["T19", "T21", "T22"]
blocks: ["T31"]
acs: ["AC-08", "AC-13", "AC-15", "AC-18", "AC-19", "AC-33"]
files_hint: ["tests/e2e/ai-chat-v2-chat.spec.ts", "tests/e2e/ai-chat-v2-chat.spec.ts-snapshots/", "lib/ai/e2e-stub-model.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T30 — Add e2e-through-UI tests for presses, reopen, full-height layout, empty start, phone sheets and streaming

## Place in the sequence

- **Blocked by:** T19 — Make the AI section a full-height workspace with a grouped, searchable Conversation list and phone sheets, T21 — Follow new text within 48 px with a jump-to-latest control, and pin the word-by-word streaming, T22 — Render Offered choices under a reply and send a press from the chat island
- **Blocks:** T31 — Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility
- **Wave:** 10 (longest dependency chain); linear position T30 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a new Conversation to greet me with the message box in the middle and suggested requests
> **So that** I know what to ask before I type anything
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the Conversation list and the invoice preview to open as their own screens or sheets on a phone
> **So that** the chat has the whole screen when I type
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a reply's text to appear word by word as it is written
> **So that** I see the chat working and can start reading at once
>
> — `spec.md §4, US-11, verbatim` · full text: [spec.md](../spec.md)

It proves the chat flows of US-03 to US-06 and US-11 in a real browser.

## Inlined context

> Drive the real UI in a browser against a throwaway database with the scripted model; one test per flow.
>
> — `test-plan.md §Levels, E2E-through-UI strategy, verbatim` · full text: [test-plan.md](../test-plan.md)

> An e2e layout check at 360 × 640, 768 × 1024 and 1440 × 900 (`document.scrollingElement.scrollHeight === innerHeight`, composer box in view).
>
> — `sad.md §10, QG-3 How verify, verbatim` · full text: [sad.md](../sad.md)

> Pre-release, locally before `ship` (the repo runs no e2e in CI): e2e, e2e-through-UI, visual-regression (Linux baselines) and the accessibility pass. Keep the machine awake during the run, and check the container runtime before reading a red as a regression.
>
> — `test-plan.md §CI placement, verbatim` · full text: [test-plan.md](../test-plan.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-08 — happy path

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the chat asks which Customer they mean and shows two buttons, "Acme Corp" and "Acme GmbH", under its reply; pressing "Acme GmbH" sends that choice as their message and the chat continues with a draft card for Acme GmbH
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — cross-context

> **Given** a past Conversation in which the chat offered three bank accounts as buttons and the Freelancer pressed one
> **When** they reopen that Conversation days later
> **Then** the reply shows the same three options, with the pressed one marked as chosen; when the reply was the latest one and nothing was pressed, its buttons can still be pressed, and pressing one whose account has since been deleted is turned down as an option that is no longer available, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy path

> **Given** a Freelancer on a desktop screen with 40 Conversations and an open Conversation of 60 messages
> **When** they scroll the messages or the Conversation list
> **Then** only that area scrolls; the page itself never scrolls, the message box stays visible at the bottom and the Conversation list stays in place
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — happy path

> **Given** a Freelancer who opens a new Conversation
> **When** the page appears, and then they send the first message
> **Then** they first see a greeting, the message box in the middle and suggested requests; after sending, the message box moves to the bottom with an animation and the reply appears above it. A Freelancer whose device asks for reduced motion sees the move without animation. Pressing a suggested request only fills the message box. A new Conversation left without a message is not saved and never appears in the Conversation list.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy path

> **Given** a Freelancer on a phone (a screen narrower than 768 px)
> **When** they open the AI section, switch Conversations, and open a draft's preview
> **Then** the chat fills the screen with the message box at the bottom; the Conversation list opens as its own screen or sheet and closes when they pick one; the preview opens as a full-screen sheet with the same actions as on a desktop
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-33 — happy path

> **Given** a reply of several sentences
> **When** the chat writes it
> **Then** the Freelancer sees its words appear progressively, never the whole text at once after it is complete; when they reopen the Conversation later, the saved reply is shown whole at once
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Scripted-model scenarios for an ambiguous Acme request, a three-account offer and a paused multi-sentence reply — `lib/ai/e2e-stub-model.ts`
- [ ] Tests: AC-08 press → card; AC-13 reopen with chosen mark; AC-15 layout at four sizes with 40 Conversations / 60 messages; AC-18 empty state → first reply, then listed; AC-19 phone list sheet; AC-33 ≥ 3 growing samples, reopened whole — `tests/e2e/ai-chat-v2-chat.spec.ts`
- [ ] Visual baselines (Linux container) for SCR-02 and SCR-03 with SCR-04 pressable + chosen — `tests/e2e/ai-chat-v2-chat.spec.ts-snapshots/`
- [ ] Run under `caffeinate`; check `docker info` first

## Edge cases

| Case | Behaviour |
|---|---|
| Docker down | Not a regression: restart and re-run |
| Font fetch flake in the Linux build | Retry, then remove leaked Postgres containers |

## Definition of Done

- [ ] Playwright tests against a throwaway database with the scripted model show a Customer press ending in the right card, a reopened Conversation with the chosen option marked, zero page scroll with the composer in view at 360×640, 768×1024, 1440×900 and 2560×1440, the empty-state first send, the phone list sheet, and at least three samples of growing streamed text, with approved Linux visual baselines for SCR-02 and SCR-03/SCR-04.
- [ ] the spec passes locally twice in a row
- [ ] baselines approved deliberately
- [ ] no leaked testcontainers after the run
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
