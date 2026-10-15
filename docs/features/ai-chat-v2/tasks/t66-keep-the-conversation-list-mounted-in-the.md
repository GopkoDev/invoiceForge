---
id: T66
title: "Keep the Conversation list mounted in the AI layout and update it from chat events"
layer: "ui"
deps: []
blocks: ["T67", "T69"]
acs: ["AC-17", "AC-52"]
files_hint: ["app/(protected)/ai/layout.tsx", "app/(protected)/ai/page.tsx", "app/(protected)/ai/[conversationId]/page.tsx", "components/ai/ai-workspace.tsx", "components/ai/conversation-list-context.tsx", "components/ai/conversation-list-client.tsx", "components/ai/chat-island.tsx"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "S"
status: "todo"
---

# T66 — Keep the Conversation list mounted in the AI layout and update it from chat events

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** — · **Blocks:** T67 — Align the list top row with the chat header, size every skeleton to its content, and level the avatar with the first line, T69 — Register QuestionForm, ConversationListProvider and the Markdown MessageResponse in the design system and update ux-flows for the form · **Wave:** 1 (longest dependency chain inside T50+).
- **Lane:** shares `components/ai/chat-island.tsx`, `components/ai/conversation-list-client.tsx` with T60, T67 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It makes switching Conversations change only the chat pane.

## Inlined context

> **F13.** From 768 px wide, the Conversation list's search row and the chat header have the same height … Every loading skeleton has the size and position of what replaces it … Picking another Conversation changes the address … and changes only the chat pane: the Conversation list stays as it is (its scroll position and search text kept), is not loaded again … An assistant avatar is level with the first line of its message.
>
> — `spec.md §1, F13, abridged` · full text: [spec.md](../spec.md)

> `ai/layout.tsx` (server) resolves the actor, loads `listConversationSummaries` once per layout render, and renders `AiWorkspace` with `ConversationListProvider` (client) around `{children}` … List events (the only writers): `conversation-created`, `conversation-touched`, `conversation-renamed`, `conversations-deleted` … `revalidatePath('/ai', 'layout')` is not used by chat actions … The active row follows `useSelectedLayoutSegment()`.
>
> — `adr/0013, Decision outcome, abridged` · full text: [ADR-0013](../adr/0013-keep-the-conversation-list-mounted-in-the-ai-layout-and-update-it-from-chat-events.md)

> Moving the list into the layout breaks the live-chat hand-over between `/ai` and `/ai/{id}` — the hand-over e2e tests stay and must pass unchanged.
>
> — `sad.md §11, risk (2026-10-13), abridged` · full text: [sad.md](../sad.md)

> **Hard rule (owner, 2026-10-13):** existing AC tests stay green and are never weakened; a test of a superseded AC is rewritten for the new behaviour, never deleted silently.
>
> — `tasks/_epic.md §Decisions, D-15, verbatim`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Client contract `ConversationListProvider`: `conversationCreated`, `conversationTouched`, `conversationRenamed`, `conversationsDeleted`, `useConversationList()`.

— `contracts/server-actions.md §Revision 2026-10-13, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-17 — happy path

> **Given** a Freelancer with Conversations whose last messages were today, yesterday, 7 days ago and 8 days ago
> **When** they open the AI section, and then type "inv" into the Conversation search
> **Then** the list is grouped under Today, Yesterday, Previous 7 days (the one from 7 days ago) and Older (the one from 8 days ago), with a New chat button at its bottom; the search shows only the Conversations whose titles contain "inv", ignoring case, extra spaces and look-alike letters, and says so when none match
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-52 — happy path

> **Given** a Freelancer with 40 Conversations who scrolled the list halfway down and typed "inv" into its search
> **When** they pick another Conversation in the list
> **Then** only the chat pane changes and shows a loading state; the list is not loaded again, keeps its scroll position, search text and rows, and marks the picked Conversation as active; the list changes later only when a Conversation is created, renamed or deleted, or when a new message moves a Conversation to the top
>
> — `spec.md §5, AC-52, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] move `AiWorkspace` + list into the layout; pages render header + island only
- [ ] provider + events raised from saved turns, rename, delete (list and header)
- [ ] active row from the layout segment
- [ ] component tests for the events; re-run the existing hand-over and list e2e specs

## Edge cases

| Case | Behaviour |
|---|---|
| delete the open Conversation | row removed, navigate to /ai |
| hard reload | layout loads summaries again, provider reconciles by id |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] component tests pass
- [ ] existing AI e2e specs pass locally unchanged (docker info checked, machine kept awake)
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T66`
