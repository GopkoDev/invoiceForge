---
id: T18
title: "Add the AI section route and sidebar entry and render the Conversation list with paging, empty state and the retention notice"
layer: "ui"
deps: ["T10"]
blocks: ["T22", "T23", "T30"]
acs: ["AC-35", "AC-38", "AC-42"]
files_hint: ["config/routes.config.ts", "config/navigation-menu.config.ts", "config/navigation-icons.config.ts", "app/(protected)/ai/page.tsx", "app/(protected)/ai/loading.tsx", "components/ai/conversation-list.tsx", "tests/component/ai-conversation-list.test.tsx", "tests/unit/routes-config.test.ts", "tests/unit/proxy.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T18 — Add the AI section route and sidebar entry and render the Conversation list with paging, empty state and the retention notice

## Place in the sequence

- **Blocked by:** T10 — List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice · **Blocks:** T22 — Build the AI start panel with example prompts, the start=draft variant and the AllowanceNotice counter and used-up modes, T23 — Render a saved Conversation with ChatLink invoice states, the not-found page and the loading skeleton, T30 — Mount the AI-section modal container and confirm deleting one or all Conversations from the list and the Conversation header · **Wave:** 3 — the page shell every other AI screen task plugs into.
- **Lane:** shares `app/(protected)/ai/page.tsx` with T22, T33; shares `components/ai/conversation-list.tsx` with T30; shares `tests/unit/proxy.test.ts` with T31 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** a list of my past Conversations that I can reopen and continue
> **So that** I can pick up where I left off
>
> — `spec.md §4, US-11, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to delete one or all of my Conversations, and to know they are deleted automatically after 90 days
> **So that** my customers' names and amounts do not pile up in a chat history forever
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the chat to see only my own data and only while I am signed in
> **So that** no one else's data reaches me and no one reaches mine through it
>
> — `spec.md §4, US-13, verbatim` · full text: [spec.md](../spec.md)

This task gives the AI section its place in the navigation and its list of past Conversations, behind sign-in.

## Inlined context

> New route `/ai` (`app/(protected)/ai/page.tsx`, RSC). Reads `getAllowanceState` and `listConversations` (sad.md §6 flow 4). … Opening the section writes and counts nothing.
>
> - **Navigation:** a new main-section entry **"AI"** after "Invoices" in `config/navigation-menu.config.ts` (route `/ai`, `ux-flows.md` §Platform decisions).
> - **Posture:** responsive-both. At `lg` (1024 px) and wider, the AI section is two panes inside the content area: the Conversation list in a 288 px column on the left, and the start panel or the open Conversation on the right. Below `lg`, `/ai` stacks the start panel above the list, and `/ai/{id}` shows only the Conversation with a "← All conversations" link.
> - **Error routing:** A Visitor reaching `/ai` or `/ai/{id}` is redirected by the proxy to sign-in (SCR-11, AC-42). … A failed page read goes through `unwrapPageResult` to the segment's `error.tsx` (`LoadError`).
>
> — `screens.md §SCR-01 intro + §Source, abridged` · full text: [screens.md](../screens.md)

**SCR-01 states this task builds (the list column and page frame; the start panel is T22):**

| State | Trigger / condition | Components |
|---|---|---|
| loading | Page request in flight: new `ai/loading.tsx` with a start-panel skeleton and five list-row skeletons | `Skeleton` |
| default (list) | Past Conversations, newest `lastMessageAt` first, each "{title}" · "{date of last message}", with a delete icon button per row, a "New conversation" button, a "Delete all" action, and the fixed retention notice "Conversations are kept for 90 days after their last message." (AC-35, AC-38) | `ScrollArea`, `Item`, `DropdownMenu`, `Pagination` |
| empty | No Conversations yet: the list shows `Empty` "No conversations yet" / "Ask a question to start one." The retention notice and "New conversation" stay; "Delete all" is hidden | `Empty` |
| paged | More than 20 Conversations: `Pagination` under the list, 20 per page by page number | `Pagination` |
| error | `getAllowanceState` or `listConversations` fails → `unwrapPageResult` → existing `(protected)/error.tsx` (`LoadError`) | `LoadError` |
| signed out | Visitor → proxy → SCR-11; nothing processed or counted (AC-42) | — |

— `screens.md §SCR-01, states table, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** Proxy deny-by-default including `/api`, public paths an explicit allowlist (architecture-hardening ADR-0001); a new page route goes into `protectedRoutesBase`.
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** UI: shadcn/ui (base-vega) + Tailwind 4 tokens; reusable components registered in `docs/design-system.md`.
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

The row delete buttons and "Delete all" open SCR-04, which T30 wires; here they render and call an `onDelete` prop that T30 connects.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) SCR-01 wireframes · [server-actions.md](../contracts/server-actions.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `listConversations(actor, page?)` → `Page<ConversationSummary>` (`{ id, title ≤ 80, lastMessageAt }`, 20 per page, newest first) through `unwrapPageResult`. Route: `/ai` added to `protectedRoutesBase` (`ai: '/ai'`) and `protectedRoutes.aiConversation(id)`.

— `contracts/server-actions.md §listConversations, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-35 — happy path

> **Given** a Freelancer with past Conversations
> **When** they open the AI section
> **Then** they see their Conversations, newest first, each with a title and the date of its last message. Opening one shows the whole exchange, and they can continue it; each new message counts toward the allowance.
>
> — `spec.md §5, AC-35, verbatim` · full text: [spec.md](../spec.md)

### AC-38 — domain invariant

> **Given** a Conversation whose last message was 90 days ago
> **When** that day passes
> **Then** the Conversation is deleted automatically, and the Conversation list tells the Freelancer that Conversations are kept for 90 days after their last message
>
> — `spec.md §5, AC-38, verbatim` · full text: [spec.md](../spec.md)

### AC-42 — authorization

> **Given** a Visitor who is not signed in
> **When** they try to reach the AI section or send a message to the chat
> **Then** they are sent to sign in; no message is processed and nothing is counted
>
> — `spec.md §5, AC-42, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `ai: '/ai'` in `protectedRoutesBase`, `aiConversation(id)` — `config/routes.config.ts`
- [ ] Sidebar entry "AI" after "Invoices" with an icon — `config/navigation-menu.config.ts`, `config/navigation-icons.config.ts`
- [ ] `/ai` RSC page: two-pane layout at `lg`, stacked below; list column reads `listConversations(page)` from `searchParams` — `app/(protected)/ai/page.tsx`
- [ ] Loading skeleton — `app/(protected)/ai/loading.tsx`
- [ ] `ConversationList` (rows, empty, pagination, retention notice, ⋯ menu with "Delete all") — `components/ai/conversation-list.tsx`
- [ ] Tests: component states; routes-config includes `/ai`; proxy redirects a Visitor on `/ai` and `/ai/x` — `tests/component/ai-conversation-list.test.tsx`, `tests/unit/routes-config.test.ts`, `tests/unit/proxy.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `?page=999` | shared `paginate` behaviour, like other web lists |
| Title of 80 characters | truncated with ellipsis in the row, full title as `title` attribute |
| Visitor on `/ai/{id}` | redirected to sign-in, returns to that page after (SCR-11) |
| Opening the section | writes nothing, counts nothing |

## Definition of Done

- [ ] Component tests render SCR-01 loading, default list, empty, paged and error states from listConversations, the retention notice is always shown, the sidebar shows "AI" after "Invoices", and the proxy unit test shows a Visitor on /ai and /ai/{id} is redirected to sign-in.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
