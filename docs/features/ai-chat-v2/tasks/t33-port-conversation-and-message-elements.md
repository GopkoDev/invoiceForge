---
id: T33
title: "Port the Conversation, Message and Loader elements from Vercel AI Elements onto Base UI, with the licence files"
layer: "ui"
deps: []
blocks: ["T36"]
acs: ["AC-16", "AC-33"]
files_hint: ["components/ai-elements/conversation.tsx", "components/ai-elements/message.tsx", "components/ai-elements/loader.tsx", "components/ai-elements/LICENSE", "components/ai-elements/NOTICE", "tests/component/ai-elements-conversation-message.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T33 — Port the Conversation, Message and Loader elements from Vercel AI Elements onto Base UI, with the licence files

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** — (starts at once; all earlier tasks are done)
- **Blocks:** T36 — Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again
- **Wave:** 1 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It gives the chat its reusable scroll and message anatomy, keeping the 48 px follow and the plain-text rule by construction.

## Screens

- SCR-03 `default`, `waiting`, `streaming`, `following`, `scrolled up` (the elements only; wiring is T36).

## Inlined context

> | Our file | Elements | Built on | Deviation from upstream |
> |---|---|---|---|
> | `conversation.tsx` | `Conversation`, `ConversationContent`, `ConversationEmptyState`, `ConversationScrollButton` | `div` scroll area, `Button` | Driven by our `useFollowLatest` hook (48 px, reduced motion, jump control), not `use-stick-to-bottom`. No `ConversationDownload`. |
> | `message.tsx` | `Message` (`from`), `MessageContent`, `MessageAvatar`, `MessageResponse`, `MessageActions`, `MessageAction` | `Avatar`, `Button`, `Tooltip` (Base UI) | `MessageResponse` renders plain text with line breaks kept (no streamdown, no Markdown, no links). `MessageAvatar` comes from the earlier upstream API. No branch selector. |
> | `loader.tsx` | `Loader` | `Spinner` | Replaces upstream `Shimmer` (needs `motion`). Static under `prefers-reduced-motion`. |
>
> — `adr/0010, Decision outcome, «What is ported», abridged` · full text: [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)

> **Licence.** AI Elements is Apache License 2.0 ("Copyright 2023 Vercel, Inc."; the repository has no NOTICE file). Each ported file starts with a header comment: adapted from Vercel AI Elements (URL, file, commit), Copyright 2023 Vercel, Inc., Apache-2.0, "Modified: rebuilt on @base-ui/react; see ADR-0010". `components/ai-elements/LICENSE` carries the full Apache-2.0 text, and `components/ai-elements/NOTICE` names the source and the changes (Apache-2.0 §4(a)–(b)).
>
> — `adr/0010, Decision outcome, «Licence», verbatim`

> `Conversation` provides the follow context (`isAtBottom`, `jumpToLatest`); `ConversationContent` is the centred `max-w-3xl` column; `ConversationScrollButton` renders only while not at the bottom; `ConversationEmptyState` centres its children both ways … `Message` `from: 'user' | 'assistant'` sets alignment and the `data-role` attribute the tests read; `MessageContent` is the user bubble or the assistant column; `MessageAvatar` wraps `Avatar`/`AssistantMark`; `MessageResponse` renders a string as plain text with line breaks kept … `MessageAction` = ghost `Button` `size="sm"` with an icon and a visible label, optional Base UI `Tooltip` … `Loader` = `Spinner` + optional visible label ("Thinking…"), `role="status"`, static under reduced motion
>
> — `screens.md §New components, «Presentation revision» table, abridged` · full text: [screens.md](../screens.md)

> A Freelancer message is a `MessageContent` bubble aligned right, `bg-secondary text-secondary-foreground`, `rounded-2xl`, `px-4 py-2.5`, max 80 % of the column; never full width and never `bg-primary`. An assistant message is not a bubble: `MessageAvatar` (the `AssistantMark`, 24 px) then a full-column-width `MessageContent` with `MessageResponse` text.
>
> — `screens.md §Source, «Messages», verbatim`

> **Hard rule — plain-text replies.** `MessageResponse` renders plain text with line breaks kept (no Markdown, no HTML, no model-written link, ai-assistant AC-07; ADR-0010).
>
> — `screens.md §Source, «Messages», verbatim` · full text: [screens.md](../screens.md)

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

- [ ] Fetch upstream `packages/elements/src/{conversation,message}.tsx` at commit `6a9d5b1` (github.com/vercel/ai-elements) as the reference; keep export names and prop shapes where the deviation table allows
- [ ] `components/ai-elements/LICENSE` (full Apache-2.0 text) and `NOTICE` (source URL + commit, Copyright 2023 Vercel, Inc., list of modifications)
- [ ] RED: `tests/component/ai-elements-conversation-message.test.tsx` — follow within 48 px, no jump beyond it with the scroll button shown, `jumpToLatest` hides it; `Message from` sets `data-role` + alignment; `MessageResponse` shows `**bold** <b>x</b> [x](https://evil.example)` literally with no anchor; `MessageAction` has an accessible name; `Loader` has `role="status"` and no animation class under reduced motion
- [ ] `conversation.tsx` on top of `components/ai/use-follow-latest.ts` (import, do not fork; the hook's own tests stay as they are)
- [ ] `message.tsx` on `components/ui/avatar`, `button`, `tooltip`; `loader.tsx` on `components/ui/spinner`
- [ ] Attribution header on every ported file; grep proves no `@radix-ui` import under `components/ai-elements/`

## Edge cases

| Case | Behaviour |
|---|---|
| Upstream API uses a Radix-only prop (`asChild`, Slot) | Use Base UI's `render` prop or plain composition; record the deviation in the file header |
| Reply text with Markdown, HTML or a URL | Shown literally, no anchor (AC-07) |
| Scrolled 49 px up while streaming | No follow; scroll button visible (AC-16) |
| Reduced motion | Jump is `behavior: 'auto'`; `Loader` static |

## Definition of Done

- [ ] components/ai-elements/conversation.tsx, message.tsx and loader.tsx export the ADR-0010 anatomy built only on components/ui and @base-ui/react (no Radix, no new package), Conversation is driven by useFollowLatest (48 px) and MessageResponse renders plain text, each file carries the Apache-2.0 attribution header, LICENSE and NOTICE exist, and component tests written first prove follow/jump, alignment by role, plain text and the reduced-motion loader.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] `package.json` unchanged (no new dependency); no `@radix-ui` import under `components/ai-elements/`.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
