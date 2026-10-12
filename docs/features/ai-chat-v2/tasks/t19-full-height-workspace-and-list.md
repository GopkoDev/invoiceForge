---
id: T19
title: "Make the AI section a full-height workspace with a grouped, searchable Conversation list and phone sheets"
layer: "ui"
deps: ["T18"]
blocks: ["T20", "T30"]
acs: ["AC-15", "AC-17", "AC-19", "AC-36"]
files_hint: ["app/(protected)/ai/layout.tsx", "app/(protected)/ai/page.tsx", "app/(protected)/ai/[conversationId]/page.tsx", "app/(protected)/ai/loading.tsx", "components/ai/ai-workspace.tsx", "components/ai/conversation-list.tsx", "components/ai/conversation-list-client.tsx", "docs/design-system.md", "tests/component/ai-workspace-t44.test.tsx", "tests/component/ai-conversation-list.test.tsx"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T19 — Make the AI section a full-height workspace with a grouped, searchable Conversation list and phone sheets

## Place in the sequence

- **Blocked by:** T18 — List every Conversation summary and the latest three, and add the grouping and title-search helpers
- **Blocks:** T20 — Redesign the empty Conversation start with suggested requests and the composer move, and send the start point, T30 — Add e2e-through-UI tests for presses, reopen, full-height layout, empty start, phone sheets and streaming
- **Wave:** 6 (longest dependency chain); linear position T19 of T31 for the sequential in-place run.
- **Lane:** shares `app/(protected)/ai/page.tsx` with T20; `docs/design-system.md` with T22; `docs/design-system.md` with T23; `components/ai/ai-workspace.tsx` with T24; `app/(protected)/ai/page.tsx` with T26 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the Conversation list and the invoice preview to open as their own screens or sheets on a phone
> **So that** the chat has the whole screen when I type
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

It makes the message box and the Conversation list always reachable, on desktop and phone.

## Inlined context

> **Full-height workspace** (inline). The `/ai` layout replaces the scrolling `ContentArea` with a viewport-height shell (`dvh` minus the app header). The grid panes are `min-h-0`, each with its own `overflow-y-auto`.
> - **Breakpoints** move from the current `lg` to `md` (768 px) and `xl` (1280 px), per spec §1.
> - **Phone sheets.** The list and the preview use the existing `Sheet`.
>
> — `sad.md §5, building-block decisions, abridged` · full text: [sad.md](../sad.md)

> SCR-01 states: loading (full-height grid skeleton) · default (groups "Today", "Yesterday", "Previous 7 days", "Older"; empty groups hidden; only the list scrolls) · searching (folded filter, instant, no request) · search no match (`Empty` "No conversation matches "{query}"." + "Clear search") · empty ("No conversations yet") · new row (merged at the head of Today) · phone sheet (`< md`, left `Sheet`, `min(20rem, 85vw)`, closes on a pick, `×`, Escape) · behind toggle (`md`–`xl` with preview open) · signed out (proxy → sign-in). Footer always visible: full-width "New chat" above the retention notice. `?page=N` links and `Pagination` removed.
>
> — `screens.md §SCR-01, states, abridged` · full text: [screens.md](../screens.md)

> AI section page scroll | 0 px of page-level scroll on viewports from 360 × 640 to 2560 × 1440; the message box fully visible at every size | e2e layout check at 360 × 640, 768 × 1024, 1440 × 900
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

> Reuse: `AiWorkspace`, `ConversationList`, `NewConversationProvider`, `Sheet`, `ScrollArea`, `InputGroup`, `Item`, `Empty`, `DropdownMenu`, `Skeleton`, `Button` (docs/design-system.md inventory). No new component; no new dependency.
>
> — `screens.md §SCR-01 components + sad.md §5 «No new dependency», abridged` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Reads `listConversationSummaries(actor)` (T18) in the `/ai` pages instead of the paged list.

— `contracts/server-actions.md §listConversationSummaries, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-15 — happy path

> **Given** a Freelancer on a desktop screen with 40 Conversations and an open Conversation of 60 messages
> **When** they scroll the messages or the Conversation list
> **Then** only that area scrolls; the page itself never scrolls, the message box stays visible at the bottom and the Conversation list stays in place
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — happy path

> **Given** a Freelancer with Conversations whose last messages were today, yesterday, 7 days ago and 8 days ago
> **When** they open the AI section, and then type "inv" into the Conversation search
> **Then** the list is grouped under Today, Yesterday, Previous 7 days (the one from 7 days ago) and Older (the one from 8 days ago), with a New chat button at its bottom; the search shows only the Conversations whose titles contain "inv", ignoring case, extra spaces and look-alike letters, and says so when none match
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — happy path

> **Given** a Freelancer on a phone (a screen narrower than 768 px)
> **When** they open the AI section, switch Conversations, and open a draft's preview
> **Then** the chat fills the screen with the message box at the bottom; the Conversation list opens as its own screen or sheet and closes when they pick one; the preview opens as a full-screen sheet with the same actions as on a desktop
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-36 — authorization

> **Given** a Visitor who is not signed in
> **When** they try to reach the AI section or the dashboard's prompt box
> **Then** they are sent to sign in; no message is processed and nothing is counted
>
> — `spec.md §5, AC-36, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Viewport-height shell for `/ai` (no page scroll), panes `min-h-0` + own scroll — `app/(protected)/ai/layout.tsx`, `loading.tsx`
- [ ] `AiWorkspace` grid with `md`/`xl` breakpoints and the phone list `Sheet` (header list button) — `components/ai/ai-workspace.tsx`
- [ ] `ConversationList`: groups via `groupConversations`, search via `filterByTitle`, no-match/empty states, fixed footer with New chat, `aria-current` on the open row; drop pagination — `components/ai/conversation-list.tsx`, `conversation-list-client.tsx`
- [ ] Pages read `listConversationSummaries` — `app/(protected)/ai/page.tsx`, `[conversationId]/page.tsx`
- [ ] Update the `AiWorkspace` and `ConversationList` rows in the inventory — `docs/design-system.md`
- [ ] Component tests: four headings, filtered rows, "No conversation matches", New chat last, sheet closes on pick — `tests/component/`

## Edge cases

| Case | Behaviour |
|---|---|
| 40 Conversations, 60 messages | Only panes scroll (verified end-to-end in T30) |
| Visitor not signed in | Proxy sends to sign-in, nothing counted (AC-36) |
| Search with look-alike letters | Matches via the shared fold |

## Definition of Done

- [ ] The AI section renders in a viewport-height shell where only the list and the messages scroll, the list shows the four groups, the folded search, the no-match text and New chat in a fixed footer, below 768 px the list opens as a left sheet that closes on a pick, the ?page links are gone, and docs/design-system.md describes the changed AiWorkspace and ConversationList.
- [ ] component tests green
- [ ] design-system inventory updated
- [ ] no new dependency
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
