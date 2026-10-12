---
slug: ai-assistant
date: 2026-10-12
triage: regression
acs: [AC-35]
commit: pending
recurrence_of: none
---

# Fix: the chat reloads behind a skeleton after the first reply on /ai

## Symptom

In `next dev`, the Freelancer sent the first message of a new Conversation from `/ai`. They expected the reply to be added to the chat in place. Instead, once the reply had finished, the page showed the route's loading skeleton and then rendered the Conversation again. Every new Conversation started from `/ai` (or `/ai?start=draft`) did this. A message sent on `/ai/{id}` did not.

The e2e run at HEAD reproduced it on a production build: after the first reply, a `[data-slot="skeleton"]` element had been added to the page (`skeletons: 1`) and the chat had been mounted again.

## Root cause

`components/ai/chat-island.tsx` `onFinish` (HEAD lines 242–247) called `router.replace('/ai/{id}')` once the first reply was saved. T35 (7409f00) added this so the Draft card of the first reply would render. The island mounted by `/ai` has no cards and no link states, and a `router.refresh()` kept serving `/ai`. But `/ai` → `/ai/{id}` is a navigation to a new dynamic segment. Next shows its `loading.tsx` (`app/(protected)/ai/[conversationId]/loading.tsx`) and mounts a new page with a new island. This broke the SCR-01 contract in screens.md ("sending first message": the URL becomes `/ai/{id}` "without remounting the island"). The component test pinned the navigation as expected (`expect(replace).toHaveBeenCalledWith('/ai/cLate')`), and no e2e checked that the chat stayed mounted.

## The fix

- The island never navigates after a reply. On `/ai` the address still becomes `/ai/{id}` through `history.replaceState`, and the list still shows the new row through `NewConversationProvider`.
- After each finished reply in a Conversation started on `/ai`, the island reads the cards and invoice-link states through a new server action, `loadConversationCards(id)` (`lib/actions/assistant-actions.ts`, an owner-scoped read over `getConversation`; documented in `contracts/server-actions.md`). An island mounted by `/ai/{id}` still calls `router.refresh()`.
- The island on `/ai` shows the Conversation header (title, "New conversation", delete) once the Conversation is saved, as `/ai/{id}` does, so the layout matches SCR-02 without a navigation.
- Going back to `/ai` (the sidebar, "New conversation", or after deleting from the header) reaches the same mounted page, because the router tree is still the `/ai` page. `ChatIsland` therefore starts a fresh chat (a new `key`) whenever the pathname returns to `/ai`.

AC-35 still holds: reopening `/ai/{id}` renders the whole exchange from `getConversation`. R-02 still holds: the island learns the id only from `data-conversation`, which is sent only after the turn is saved.

## The pinning test

Component, `tests/component/ai-chat-island.test.tsx`:

- "the first reply on /ai is appended in place: no navigation, the card comes from the saved Conversation". Before the fix it failed at `expect(replace).not.toHaveBeenCalled()` (line 667) with `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times`.
- "going back to /ai from the new Conversation starts a fresh chat" guards the reset that the in-place design needs.
- "adopts the id only from the late data-conversation (after text) and ends on /ai/{id}" no longer expects `router.replace`.

Integration, `tests/integration/actions/load-conversation-cards.test.ts`: the action returns the cards and link states of the Freelancer's own Conversation. Another Freelancer's id answers like an unknown one (NOT_FOUND), and no session is UNAUTHORIZED.

e2e, `tests/e2e/ai-assistant.spec.ts` "AC-01: a question is answered in the chat, with a link, and the allowance counts it" now watches the page while the first reply arrives: no skeleton may be added and no message element may be removed (a remount removes them). A first version of the check (skeletons added, composer element kept) failed at HEAD with `skeletons: 1`.

## Spec patch

None. spec.md was right: AC-35 does not ask for a navigation, and screens.md SCR-01 already says the island is not remounted. AC-35 was re-verified (the e2e and page tests open `/ai/{id}` and show the exchange).

## Follow-ups

- After a draft is created from a card in a Conversation started on `/ai`, the server action revalidates `/invoices`. Next may then re-render the current route for the swapped address `/ai/{id}`. The card keeps its own Created state either way, and the e2e AC-13 flow (a card created from `/ai?start=draft`) passes. Whether this re-render remounts the chat once after Create is not pinned here.
- On phones, `/ai` keeps the Conversation list below the chat after the first reply, while `/ai/{id}` hides it (SCR-01 / SCR-02). This is a cosmetic difference from opening the Conversation.
- The Linux visual baseline `ai-draft-card-live.png` was drawn on `/ai/{id}` after the old navigation. The layout should match (the header is now drawn by the island), but it was not re-run here (macOS skips the baselines).
