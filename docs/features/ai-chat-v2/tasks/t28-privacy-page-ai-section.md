---
id: T28
title: "Update the privacy page AI section for what the chat stores and shares, and check the terms page"
layer: "docs"
deps: []
blocks: ["T31"]
acs: ["AC-35"]
files_hint: ["app/(public)/privacy/privacy-content.tsx", "tests/component/privacy-ai-section.test.tsx", "docs/features/ai-chat-v2/spec.md"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T28 — Update the privacy page AI section for what the chat stores and shares, and check the terms page

## Place in the sequence

- **Blocked by:** nothing (can start first)
- **Blocks:** T31 — Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility
- **Wave:** 1 (longest dependency chain); linear position T28 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the privacy page, my data export and account deletion to cover everything the chat stores
> **So that** I can trust what happens to my Conversations, choices and prompts
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

It tells Visitors and Freelancers honestly what the chat keeps and what a connected AI client can read.

## Inlined context

> 1. **What is stored:** Conversations with their messages and draft cards; the options the chat offered as buttons and the one chosen; prompts sent from the dashboard (stored as the first message of the Conversation they start); whether each message was typed, pressed or sent from the dashboard; and where each Conversation was started.
> 2. **How long:** 90 days after the last message of a Conversation, or until the Freelancer deletes it or the account.
> 3. **Who processes message text:** the model provider through its gateway, as already named on the page. There is no new processor.
> 4. **What the reads share with an AI client connected through a Personal key:** sender profile names and defaults; bank name, last four digits and currency of each account, never a full account number; products with their prices and Custom prices; and Customers found by name.
>
> The final legal wording is `implement`'s, reviewed by the owner before ship. The terms page changes only if it contradicts the chat (spec §8).
>
> — `screens.md §SCR-13, verbatim` · full text: [screens.md](../screens.md)

> Does the terms page need an AI clause (for example that the Freelancer reviews and issues every Assistant draft)? Default now: no change unless the terms page contradicts the chat; the check runs with the privacy update. — owner: Dmytro Hopko, due: before `sdd:ship`
>
> — `spec.md §8, open question, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-35 — happy path

> **Given** a Visitor or a Freelancer reading the privacy page
> **When** they read its AI section
> **Then** it says which chat data is stored (Conversations with their messages, draft cards, Offered choices and the ones chosen, prompts sent from the dashboard, where each message and Conversation came from), how long it is kept (90 days after the last message, or until deleted), who processes message text (the model provider through its gateway), and what the sender-profile and product reads share with an AI client connected through a Personal key (bank name, last four digits, currency — never a full account number)
>
> — `spec.md §5, AC-35, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Rewrite the AI section in the page's existing heading/paragraph style — `app/(public)/privacy/privacy-content.tsx`
- [ ] Component test for the four statements — `tests/component/privacy-ai-section.test.tsx`
- [ ] Read the terms page; if nothing contradicts the chat, note "checked, no change" under the §8 open question (leave it open for the owner); otherwise draft the minimal change and flag it — `docs/features/ai-chat-v2/spec.md`
- [ ] Mark this task `review` in the tracker until the owner approves the wording

## Edge cases

| Case | Behaviour |
|---|---|
| Visitor not signed in | Page loads (public) |
| Owner rejects the wording | Task returns to `in_progress`; ship waits |

## Definition of Done

- [ ] The privacy page's AI section states what is stored, the 90-day retention, the model provider through its gateway as the processor, and that reads share bank name, last four digits and currency but never a full account number, a component test asserts those statements, the terms page is checked against the chat, and the wording is flagged for the owner's review before ship.
- [ ] component test green
- [ ] terms check recorded under spec §8
- [ ] owner review of the wording requested (blocks ship, not implement)
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
