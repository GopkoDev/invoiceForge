---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0009 — Hand the dashboard prompt to the AI section through a one-time session-storage entry

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

A prompt sent from the dashboard opens the AI section on a new Conversation where "that message is already sent and the reply is being written; the message counts toward the allowance once" (AC-29). An empty or over-limit prompt creates nothing (AC-31). With the allowance used up, nothing is sent (AC-32). Replies stream only in the chat island (ux-flows: "the dashboard hands off, it does not chat"). This was ux-flows design input (4). SAD §4 seed 5.

## Decision drivers

- Exactly once: a reload, Back, or React's double effect in development must not send the prompt again.
- Confidential data (spec §6.1): prompt text must not land in URLs, browser history, or server and CDN logs.
- One message path: the dashboard prompt is an ordinary first message through the chat route (spec §1).

## Considered options

1. **A one-time session-storage entry.** The dashboard validates the prompt with the chat's message schema, stores `{ prompt }` under a random hand-off id in `sessionStorage`, and navigates to `/ai?handoff={id}`. The island takes and removes the entry once (with a module-level guard), drops `handoff` from the address with `replaceState`, and sends it as the first message with origin `DASHBOARD`.
2. **The prompt in the query string** (`/ai?prompt=…`), auto-sent on mount.
3. **A server action on the dashboard** that saves the Conversation and the first message, then redirects to `/ai/{id}`, where the island streams a reply for the unanswered message.

## Decision outcome

**Chosen:** Option 1. The text never leaves the browser except in the chat request itself. Consumption is a single take-and-delete in one tab, and the turn keeps the one counted path. Option 2 puts Confidential text in the URL, the history and the request logs, and resends on every reload. Option 3 needs a new "resume an unanswered message" mode in the chat route, and a split between the counted reservation and the streamed turn that the first iteration's allowance model (reserve and release in one request) does not have.

## Consequences

**Positive**
- Reload and Back find no entry and show a plain new Conversation, so the prompt is never sent twice.
- No server change beyond accepting `origin` and `startedFrom` on a first message.

**Negative**
- Blocked or unavailable storage loses the hand-off. The AI section then shows the new Conversation with nothing sent (SAD §11 fallback). A component test pins this.
- The exactly-once property is client-side; there is no server-side de-duplication key.

**Neutral**
- "Create invoice with AI" on the dashboard needs no hand-off: it links to `/ai?start=draft&from=dashboard`.

## Links

- Spec: [[../spec.md]] AC-29, AC-31, AC-32; §6.1
- SAD: [[../sad.md]] §4, §6 flow 3, §8 "Addresses"
- Related ADR: [[0005-give-a-saved-conversation-and-an-open-preview-their-own-addresses-and-keep-a-new-conversation-at-ai]]; ai-assistant ADR-0009
