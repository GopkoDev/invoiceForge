---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-13"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0013 — Keep the Conversation list mounted in the AI layout and update it from chat events

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** Dmytro Hopko (owner decision F13 of 2026-10-13; mechanism chosen by the spec-revision agent, open to owner veto)
- **Amends:** ADR-0005 (addresses unchanged; what renders under them changes).

## Context

Each AI page (`/ai`, `/ai/[conversationId]`) renders the whole `AiWorkspace` itself, list included, and loads every Conversation summary on every page render; each route's `loading.tsx` draws a skeleton of the whole workspace. So picking another Conversation re-renders and refetches the list, resets its scroll and search, and flashes the list skeleton (owner feedback F13, AC-52). The list must stay mounted and change only on its own events.

## Decision drivers

- Spec §6 "Switching Conversations": 0 list requests and 0 list re-mounts per switch; messages shown p95 ≤ 1 s.
- Spec §6 "Skeleton stability" (AC-51): only the chat pane may show a loading state on a switch.
- SAD §4: RSC pages + client islands; no client cache library; no push.
- ADR-0005 addresses (`/ai`, `/ai/{id}`, `?preview=`) stay.

## Considered options

1. **Move the workspace shell and the list into `app/(protected)/ai/layout.tsx` (chosen).** Next.js keeps a layout mounted across navigations between its child pages, so the list survives a switch; the layout loads the summaries once and seeds a client `ConversationListProvider`; the pages render only the chat pane, and their `loading.tsx` draws only the chat pane.
2. **Keep the list in the pages but cache its data client-side** (a store seeded once and reused on each page). The list still re-mounts on each navigation (scroll and search reset unless persisted by hand) and the page RSC still has to skip the summaries query conditionally.
3. **Make the whole AI section one client page** that swaps Conversations with `history.pushState` and a server action per Conversation. Full control, but it throws away the RSC page per Conversation, the not-found page, `loading.tsx` and the router-cache hand-over logic that exists and is tested.

## Decision outcome

**Chosen:** Option 1. It uses the framework's own persistence, keeps every address and page, and the list's state survives by construction. Rules:

- `ai/layout.tsx` (server) resolves the actor, loads `listConversationSummaries` once per layout render, and renders `AiWorkspace` with `ConversationListProvider` (client) around `{children}`. The list reads the provider; it never reads page props.
- **List events** (the only writers): `conversation-created` (first reply saved: add under Today), `conversation-touched` (any saved turn: move to the top with the new `lastMessageAt`), `conversation-renamed`, `conversations-deleted` (from the list's or the header's delete). The chat island and the header raise them from results they already receive; no refetch.
- Layout re-render cases are limited to hard loads, `router.refresh()` (a takeover, newer messages found in a restored page, a failed first message; never an ordinary saved turn, which reads its cards and forms with `loadConversationCards`) and navigation; the open Conversation is read from the address (`usePathname()`), the layout segment being only a fallback, because `history.replaceState` after the first send leaves the segment null; `revalidatePath('/ai', 'layout')` is not used by chat actions, so a Create-draft or Issue action does not refetch the list. A layout re-render with fresh summaries replaces the provider's state (reconciliation by id).
- Pages render only the chat pane (`ConversationHeader` + `ChatIsland`); `loading.tsx` of each page draws only the chat pane skeleton at its final dimensions.
- The active row follows `useSelectedLayoutSegment()`, so it changes on the switch without a list render from the server.

## Consequences

**Positive**
- A switch fetches only the Conversation's own data; list scroll, search text and row identity are kept (AC-52).
- The skeletons shrink to the chat pane, which makes AC-51's "nothing already on screen moves" easy to hold.

**Negative**
- The list is now client state that can drift from the server if an event is missed (another tab's new Conversation shows only on the next hard load or refresh) — the same accepted no-push debt as ADR-0008.
- The live-chat hand-over between `/ai` and `/ai/{id}` (screens.md "Addresses") must be re-checked, because the workspace no longer re-mounts with the page.

**Neutral**
- The phone sheet list reads the same provider.
- Moving back to per-page lists is a contained revert (layout and two pages).

## Links

- Spec: [[../spec.md]] §1 F13, AC-17, AC-51, AC-52, §6 "Switching Conversations", "Skeleton stability"
- SAD: [[../sad.md]] §4, §5 "Full-height workspace", "The Conversation list", §8 "Client state"
- Related ADR: [[0005-give-a-saved-conversation-and-an-open-preview-their-own-addresses-and-keep-a-new-conversation-at-ai]] (amended), [[0008-keep-invoice-states-in-one-workspace-store-fed-by-loads-and-action-results-without-push]]
