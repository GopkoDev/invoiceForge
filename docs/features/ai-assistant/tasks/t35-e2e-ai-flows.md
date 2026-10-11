---
id: T35
title: "Add Playwright flows: open the AI section, draft and create from a card, Create with AI, and the Assistant mark"
layer: "tests"
deps: ["T19", "T28", "T33"]
blocks: []
acs: ["AC-01", "AC-13", "AC-23", "AC-33"]
files_hint: ["tests/e2e/ai-assistant.spec.ts", "tests/e2e/support/ai-stub.ts", "lib/ai/model.ts", "playwright.config.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T35 — Add Playwright flows: open the AI section, draft and create from a card, Create with AI, and the Assistant mark

## Place in the sequence

- **Blocked by:** T19 — Add "Create with AI" to the invoice list header and the AssistantMark to draft rows and the editor header, T28 — Build the DraftCard component in every SCR-03 state and wire Create to createDraftFromCard, T33 — Build the useChat island: send only the new message, show waiting, streaming and every outcome, and keep the allowance live · **Blocks:** nothing — a leaf of the graph · **Wave:** 9 — the last gate; runs locally before ship (no e2e in CI).
- **Lane:** shares `lib/ai/model.ts` with T04 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** an AI section in the navigation that holds the chat and a link to connecting my own AI client
> **So that** I can use AI on my invoices right after signing in, with nothing to set up
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to describe an invoice in one sentence, check the proposed draft, and create it with one press
> **So that** I get a ready-to-review Draft invoice without filling the editor by hand
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to see which drafts an Assistant created and by which Assistant, and to review and issue them myself
> **So that** I check AI work before it reaches a Customer
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a "Create with AI" entry next to "New invoice"
> **So that** I find AI drafting exactly where I create invoices, even if I never open the AI section
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task walks the headline journeys end to end in a real browser: from opening the AI section to a Draft invoice marked as an Assistant's, and from "Create with AI" to the draft-ready chat.

## Inlined context

> Tests: vitest (unit / component / contract), an integration config on throwaway Postgres 16 containers, Playwright e2e run locally (not in CI).
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

> Covers US-01, US-10, US-11 (list) and US-13 (signed out). UI path: SCR-05 or the navigation, then SCR-01 … opened from Create with AI with messages left → new Conversation ready to draft, with an example request; opened from the navigation → chat ready, example questions, messages left, link to connect an AI client, past Conversations.
>
> Flow 11: … invoice is a draft with an Assistant origin → marked as created by the in-app chat or by the named key; … the Freelancer issues it → no Assistant mark, the issued invoice and its document say nothing about AI.
>
> — `sad.md §6, Flow 4 + Flow 11, abridged` · full text: [sad.md](../sad.md)

**Model in e2e:** the app runs against a stub model selected by an e2e-only setting (`AI_CHAT_MODEL=stub:e2e`, honoured by `getChatModel()` only when `E2E=1`) that answers the AC-12 sentence with a `propose_draft` call; no real provider is called.

**Local runbook (memory):** check `docker info` before blaming a change for an e2e red; run long e2e with `caffeinate`; after the run, check for leaked testcontainers Postgres and never prune volumes blindly (`invoiceflow-pg` is the dev DB).

**Fallback:** insufficient or contradicted by the code → read the named file in full ([sad.md](../sad.md) · [screens.md](../screens.md) SCR-01/02/03/05/06) and the existing `tests/e2e/` specs for the sign-in and DB helpers. Do not guess.

## Data delta

No DB changes. Seeds: one Freelancer with a default sender profile, a USD default bank account and Customer Acme Corp.

## API contract

Exercises `/ai`, `/ai?start=draft`, `POST /api/chat`, `createDraftFromCard`, `/invoices`, `/invoices/{id}/edit` as a signed-in user; no new surface.

## Acceptance criteria

### AC-01 — happy path

> **Given** a signed-in Freelancer who has never used AI in the app
> **When** they open the AI section from the navigation
> **Then** they see the chat ready for a question, a few example questions, how many messages they have left today, and a link to the page where they can connect their own AI client — with nothing to set up first
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy path

> **Given** the draft card from AC-12
> **When** the Freelancer presses Create
> **Then** a Draft invoice exists with exactly the card's content and a system-assigned invoice number, and the chat answers with a link that opens it in the editor; nothing is issued or sent
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — happy path

> **Given** an Assistant draft created in the chat and another created by an external Assistant through a Personal key named "Claude Desktop"
> **When** the Freelancer opens their invoice list or either draft
> **Then** each is marked as created by an Assistant, naming the in-app chat or the key's name as it was when the draft was created. Renaming or revoking the key later does not change the mark. They can edit, issue or delete it like any draft. Once issued, the visible mark is gone and the invoice the Customer receives says nothing about AI. The record of which Assistant created it is kept with the invoice for the success measure until the invoice or the account is deleted.
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

### AC-33 — happy path

> **Given** a Freelancer on their invoice list
> **When** they choose "Create with AI" next to "New invoice"
> **Then** a new Conversation opens in the AI section, ready to draft, with an example request to start from
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Stub model for e2e, gated by `E2E=1` — `tests/e2e/support/ai-stub.ts` (+ the `getChatModel()` switch)
- [ ] Spec: open AI from the sidebar → examples, "30 of 30 messages left today", connect link (AC-01); send "invoice Acme for 20 hours of consulting at $50" → card → Create once → "Open draft →" → editor shows `[Draft] [AI]` (AC-13, AC-23); issue → mark gone (AC-23) — `tests/e2e/ai-assistant.spec.ts`
- [ ] Spec: invoice list → "Create with AI" → "Draft an invoice" with the example chip (AC-33) — same file
- [ ] Register the env for the e2e web server — `playwright.config.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Docker down | e2e reds are environmental — check `docker info` first |
| Create clicked twice | one invoice in the list |
| Stub selected without `E2E=1` | ignored; the real model setting applies |

## Definition of Done

- [ ] Playwright specs with a stub model show a signed-in Freelancer opens /ai, sends the AC-12 sentence, presses Create once, lands in the editor on a draft marked AI, sees the mark gone after issuing, and reaches the draft-ready start panel from "Create with AI".
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
