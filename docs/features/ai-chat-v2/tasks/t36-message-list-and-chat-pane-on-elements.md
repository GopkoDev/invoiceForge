---
id: T36
title: "Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again"
layer: "ui"
deps: ["T33", "T35"]
blocks: ["T37", "T38", "T40", "T41"]
acs: ["AC-12b", "AC-15", "AC-16", "AC-33"]
files_hint: ["components/ai/message-list.tsx", "components/ai/chat-island.tsx", "components/ai/conversation-header.tsx", "components/ai/conversation-header-client.tsx", "tests/component/ai-conversation-page.test.tsx", "tests/component/ai-chat-island.test.tsx", "tests/component/ai-follow-latest.test.tsx", "tests/component/ai-streamed-text.test.tsx"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "done"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T36 — Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** T33 — Port the Conversation, Message and Loader elements from Vercel AI Elements onto Base UI, with the licence files, T35 — Rebuild the workspace as a bordered container and the Conversation list as plain rows with a row menu for delete
- **Blocks:** T37 — Rebuild the empty state with the time-of-day greeting, the PromptInput composer and suggestion chips, T38 — Align Offered choices, the Draft card and the preview panel with the message layout, T40 — Register the AI elements and the changed AI components in the design system, T41 — Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines
- **Wave:** 2 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** shares `components/ai/chat-island.tsx` with T37 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It replaces the full-width black pill and the bare red error card with the reference message layout.

## Screens

- SCR-03 every state (`default`, `waiting`, `streaming`, `following`, `scrolled up`, `answered — *`, `choice unavailable`, `could-not-complete / ai-unavailable`, `too-long`, `used-up`, `preview open`, `conversation-gone`, `not-found`, `deleted`, `error`); SCR-02 `could-not-complete / ai-unavailable on first send`.

## Inlined context

> **Centred column.** In SCR-02 and SCR-03 the messages column and the docked composer are centred in the chat pane with `max-w-3xl` (768 px) and `px-4`; the scroll area itself stays full width, so the scrollbar sits at the pane edge.
>
> — `screens.md §Source, «Centred column», verbatim` · full text: [screens.md](../screens.md)

> **Errors are messages.** Every failure tied to a turn (`could-not-complete`, `ai-unavailable`, `conversation-gone`, `choice unavailable`) renders as an assistant `Message` in the reply position: the avatar, an inline `Alert` (`destructive` for failures, default with an info icon for `choice unavailable`) holding the copy verbatim, and, where the row offers it, `MessageActions` with a `MessageAction` "Try again" (rotate icon, labelled, not icon-only). No bare full-width card.
>
> — `screens.md §Source, «Errors are messages», verbatim`

> | could-not-complete / ai-unavailable | As the parent (copy verbatim, live-region announcement unchanged), for a typed message and a press alike, but rendered as an assistant `Message` in the reply position … After a failed press, the offer is released (ADR-0003), so its buttons are pressable again with nothing marked. "Try again" re-sends the same thing: the text, or the same `{ offerId, optionId }`. A new message or a press instead of Try again keeps the failed exchange discarded (review 2026-10-13 R7-4) |
>
> — `screens.md §SCR-03, state table, abridged`

> **Header.** The chat pane header (`h-12`, bottom border) shows only when there is something to show: the Conversation title (truncated) and the "Conversation actions" `⋯` menu for a saved Conversation; the list button below `md` and in the `md`–`xl` preview layout. On `/ai` before the first save the header is not rendered at `≥ md` (no empty header bar); below `md` it holds only the list button, as before.
>
> — `screens.md §Source, «Header», verbatim`

> **Hard rule — plain-text replies.** `MessageResponse` renders plain text with line breaks kept (no Markdown, no HTML, no model-written link, ai-assistant AC-07; ADR-0010).
>
> — `screens.md §Source, «Messages», verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** the address hand-over rules (live chat handed to the Conversation page, refresh-once rules R1-U2 … R7-2) are behaviour and stay untouched; only markup changes.
>
> — `screens.md §Source, «Addresses», abridged`

> **Hard rule — behaviour does not change.** Behaviour does not change: every state, AC, address, hand-off, allowance notice, breakpoint, the 48 px follow and reduced motion stay exactly as specified in the rows below.
>
> — `screens.md §Source, «Presentation revision», verbatim` · full text: [screens.md](../screens.md)

> **Hard rule — one primitive system, no new dependency.** Chosen: Option 3 [port the needed elements onto Base UI as our own set in `components/ai-elements/`] … It meets the owner's direction and keeps one primitive system and zero new runtime dependencies.
>
> — `adr/0010-…-onto-base-ui.md, Decision outcome, abridged` · full text: [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) · [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md) · [sad.md](../sad.md) · [spec.md](../spec.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (The chat route, server actions and their copy are unchanged; the UI only re-renders their results.)

## Acceptance criteria

### AC-12b (US-03) — authorization

> **Given** a Conversation whose latest reply offered Acme Corp and Acme GmbH
> **When** a message arrives presented as a pressed option for a record that is not among that reply's Offered choices — an option from an older reply, or a Customer of another Freelancer
> **Then** it is never applied as a choice and never reaches the model; it does not count toward the allowance, and the chat says that this option is no longer available, in the same words whether the option was outdated, belongs to another Freelancer or never existed; the draft never moves toward that record
>
> — `spec.md §5, AC-12b, verbatim` · full text: [spec.md](../spec.md)

### AC-15 (US-04) — happy path

> **Given** a Freelancer on a desktop screen with 40 Conversations and an open Conversation of 60 messages
> **When** they scroll the messages or the Conversation list
> **Then** only that area scrolls; the page itself never scrolls, the message box stays visible at the bottom and the Conversation list stays in place
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-16 (US-04) — happy path

> **Given** a Freelancer reading the latest reply at the bottom of the messages
> **When** a new reply is being written
> **Then** the messages follow the new text while their end is no more than 48 px out of view; when they have scrolled further up to read an earlier message, the view stays where they are and a control lets them jump back to the latest message
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-33 (US-11) — happy path

> **Given** a reply of several sentences
> **When** the chat writes it
> **Then** the Freelancer sees its words appear progressively, never the whole text at once after it is complete; when they reopen the Conversation later, the saved reply is shown whole at once
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)


## Checklist

- [ ] `message-list.tsx`: compose `Message` / `MessageContent` / `MessageAvatar` / `MessageResponse`; keep `data-role`, part order, `renderCard` / `renderOffer` slots and the live region
- [ ] `chat-island.tsx`: `Conversation` + `ConversationContent` (centred `max-w-3xl`) + `ConversationScrollButton`; docked composer wrapper centred at the same width; `Loader` for `waiting`; failures as assistant `Message` + `Alert` + `MessageActions`/`MessageAction` "Try again" (same retry handler as today)
- [ ] `conversation-header*.tsx`: `h-12`, no header bar at `md+` before the first save
- [ ] Rewrite superseded assertions only where they pin markup (e.g. a `bg-primary` bubble class or the error card container); keep every copy, role, retry and no-Markdown assertion as is
- [ ] New assertions: the user bubble is not full width (max 80 %), the could-not-complete alert sits inside an assistant message with a "Try again" button that re-sends the same text, and the same for a failed press (same `{ offerId, optionId }`)

## Edge cases

| Case | Behaviour |
|---|---|
| Failed press | Offer released → buttons pressable again; Try again re-sends the same choice |
| 409 CHOICE_UNAVAILABLE | Info alert in an assistant message; no Try again; counter unchanged (AC-12b) |
| 429 on a typed message or press | `AllowanceNotice` used-up docked at the bottom (unchanged) |
| Streaming while scrolled up | View stays; scroll button shows (AC-16) |
| Reopened Conversation | Saved replies shown whole at once (AC-33) |

## Definition of Done

- [ ] SCR-03 renders through Conversation and Message in a centred max-w-3xl column with the composer docked at the same width, user messages as right-aligned secondary bubbles, assistant replies with the avatar and plain text, waiting with Loader, the scroll button from useFollowLatest, could-not-complete and ai-unavailable as an assistant message with an inline destructive alert and a Try again action that re-sends the same text or choice, choice unavailable and conversation gone as assistant messages, no empty header bar on /ai at md and wider, and the existing chat component tests stay green.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] The four SCR-03 header cases (saved, unsaved at `md+`, unsaved below `md`, `md`–`xl` with preview) are covered by component assertions.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
