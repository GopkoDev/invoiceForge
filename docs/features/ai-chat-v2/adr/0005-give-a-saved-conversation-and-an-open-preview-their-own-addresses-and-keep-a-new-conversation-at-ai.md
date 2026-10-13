---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-13"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0005 — Give a saved Conversation and an open preview their own addresses and keep a new Conversation at /ai

- **Status:** Accepted (amended 2026-10-13 by ADR-0013)
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

ux-flows design input (3) asks whether a new Conversation (SCR-02) and an open preview (SCR-06) get their own addresses that survive a reload or a shared link. A Conversation exists only from its first message (spec §1). The first iteration already swaps `/ai` to `/ai/{id}` with `history.replaceState` once the first reply is saved, and never navigates or remounts the island (fix 2026-10-12 "chat reloads on send"). On a phone the preview is a full-screen sheet, where Back is the natural way to close it. SAD §4 seed 5.

## Decision drivers

- AC-18: an empty Conversation is never saved or listed.
- AC-19 and AC-20: a phone sheet and a desktop panel with the same actions.
- AC-22: another Freelancer's preview is answered "cannot be found".
- Do not reintroduce the remount bug: no route navigation inside the workspace.

## Considered options

1. **Search parameter.** A saved Conversation is `/ai/{id}` (as today). An open preview adds `?preview={cardId}` with `history.pushState`, so Back closes it, and the island reads it with `useSearchParams` to reopen after a reload. A new Conversation stays `/ai` (`?start=draft&from=…` for the "Create … with AI" entries).
2. **Intercepting / parallel routes**: an `@preview` slot with `/ai/[conversationId]/preview/[cardId]` intercepted into the panel.
3. **No address for the preview** (component state only), so a reload closes it.

## Decision outcome

**Chosen:** Option 1. It survives a reload and a shared link, makes Back close the phone sheet, and keeps everything inside the mounted island with no route segment change, so the remount bug cannot come back. Option 2 is a route navigation: it loads a segment, can show `loading.tsx` and remount the chat, and adds two route files for a panel that is a client view anyway. Option 3 loses the panel on every reload and makes Back leave the Conversation on a phone.

## Consequences

**Positive**
- A shared `/ai/{id}?preview={cardId}` link opens the panel for its owner. Anyone else gets the existing Conversation not-found, or the preview's "cannot be found" (AC-22).
- A new Conversation leaves no trace until its first message.

**Negative**
- The island must keep the URL and panel state in sync on Back and Forward (`popstate`). That needs a component test.

**Neutral**
- A preview opens only from a created card, so its Conversation is always saved. `?preview` never appears on `/ai`.
- The parameter names the Draft card, not the invoice, so the service can tell "deleted since" (AC-21) from "cannot be found" (AC-22). See ADR-0006.

## Links

- Spec: [[../spec.md]] §1, AC-18, AC-19, AC-20, AC-22
- SAD: [[../sad.md]] §4, §8 "Addresses"
- Related ADR: [[0006-load-the-chats-invoice-preview-through-an-owner-scoped-server-action-and-the-shared-document-model]]; ai-assistant ADR-0002, fix 2026-10-12 "chat reloads on send"
