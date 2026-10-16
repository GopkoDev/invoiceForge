---
id: T18
title: "List every Conversation summary and the latest three, and add the grouping and title-search helpers"
layer: "app"
deps: ["T03", "T11"]
blocks: ["T19", "T26"]
acs: ["AC-17", "AC-30"]
files_hint: ["lib/services/conversations/conversations.ts", "lib/helpers/conversation-groups.ts", "tests/unit/conversation-groups.test.ts", "tests/integration/ai-chat-v2-conversation-summaries.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T18 — List every Conversation summary and the latest three, and add the grouping and title-search helpers

## Place in the sequence

- **Blocked by:** T03 — Move foldName into an isomorphic shared helper with one look-alike fixture set, T11 — Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen
- **Blocks:** T19 — Make the AI section a full-height workspace with a grouped, searchable Conversation list and phone sheets, T26 — Add the dashboard AI block with the prompt box hand-off, the latest Conversations and Create invoice with AI
- **Wave:** 5 (longest dependency chain); linear position T18 of T31 for the sequential in-place run.
- **Lane:** shares `lib/services/conversations/conversations.ts` with T11 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to type a request on the dashboard, see my latest Conversations there, and create an invoice with AI from the dashboard's actions
> **So that** I can use the AI from the page I open first
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

It feeds the grouped, searchable Conversation list and the dashboard's latest three.

## Inlined context

> Every Conversation of the Freelancer, newest `lastMessageAt` first, `ConversationSummary` unchanged (`id`, `title`, `lastMessageAt`). No paging … `timeZone` is the Freelancer time zone; the client groups by the last message's local day: Today, Yesterday, Previous 7 days (2–7 days before today), Older (8+). The title search folds the query and the titles with the shared `foldName` in the browser.
>
> — `contracts/server-actions.md §listConversationSummaries, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> `listLatestConversations(actor, limit = 3)` … at most 3, newest `lastMessageAt` first (`Conversation_userId_lastMessageAt_idx`). `[]` → the dashboard says there are none yet.
>
> — `contracts/server-actions.md §listLatestConversations, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **Conversation groups** are by the date of the last message in the Freelancer time zone: Today, Yesterday, Previous 7 days (2 to 7 days before today), Older (8 or more days before today). The search filters the list by Conversation title, ignoring case, extra spaces and look-alike letters.
>
> — `spec.md §1, interview decisions, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Read-only: `Conversation` (`id`, `title`, `lastMessageAt`, `userId`) by `Conversation_userId_lastMessageAt_idx`. No schema change.

— `data-model.md §Conversation, Access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `listConversationSummaries(actor) → ActionResult<{ items: ConversationSummary[]; timeZone }>` (replaces paged `listConversations`)
- `listLatestConversations(actor, limit = 3) → ActionResult<ConversationSummary[]>`

— `contracts/server-actions.md §AI section, Conversations, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-17 — happy path

> **Given** a Freelancer with Conversations whose last messages were today, yesterday, 7 days ago and 8 days ago
> **When** they open the AI section, and then type "inv" into the Conversation search
> **Then** the list is grouped under Today, Yesterday, Previous 7 days (the one from 7 days ago) and Older (the one from 8 days ago), with a New chat button at its bottom; the search shows only the Conversations whose titles contain "inv", ignoring case, extra spaces and look-alike letters, and says so when none match
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-30 — happy path

> **Given** a Freelancer with five Conversations
> **When** they open the dashboard
> **Then** they see the three latest Conversations by last message, each a link that reopens it, a link to all Conversations, and a "Create invoice with AI" action next to the dashboard's existing invoice action that opens a new Conversation ready to draft. A Freelancer with no Conversations sees that there are none yet instead of the list.
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Both service reads; keep `listConversations` callers compiling until T19 swaps them — `lib/services/conversations/conversations.ts`
- [ ] Pure `groupConversations(items, now, timeZone)` and `filterByTitle(items, query)` using the shared fold — `lib/helpers/conversation-groups.ts`
- [ ] Unit: today/yesterday/7 days/8 days; DST and midnight edges; fold search over the shared fixture — `tests/unit/conversation-groups.test.ts`
- [ ] Integration: owner-scoped, newest first, latest 3 of 5, `[]` with none — `tests/integration/ai-chat-v2-conversation-summaries.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Last message exactly at local midnight | Belongs to that local day |
| Group with no rows | Not returned / not rendered |
| Empty query | All rows |

## Definition of Done

- [ ] listConversationSummaries returns every owned Conversation newest first with the Freelancer time zone, listLatestConversations returns at most three, groupConversations puts last-message days into Today, Yesterday, Previous 7 days (2–7) and Older (8+) under a fixed clock and zone, and filterByTitle folds case, spaces and look-alike letters.
- [ ] unit + integration tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
