---
id: T35
title: "Rebuild the workspace as a bordered container and the Conversation list as plain rows with a row menu for delete"
layer: "ui"
deps: []
blocks: ["T36", "T41"]
acs: ["AC-15", "AC-17", "AC-19"]
files_hint: ["app/(protected)/ai/layout.tsx", "app/(protected)/ai/loading.tsx", "components/ai/ai-workspace.tsx", "components/ai/conversation-list.tsx", "components/ai/conversation-list-client.tsx", "tests/component/ai-conversation-list.test.tsx", "tests/component/ai-delete-conversations.test.tsx", "tests/component/ai-workspace-t44.test.tsx", "tests/component/ai-layout-reuse-t40.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T35 — Rebuild the workspace as a bordered container and the Conversation list as plain rows with a row menu for delete

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** — (starts at once; all earlier tasks are done)
- **Blocks:** T36 — Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again, T41 — Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines
- **Wave:** 1 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It fixes the cramped list with trash icons and puts the whole section in the reference container.

## Screens

- SCR-01 every state (`loading`, `default`, `searching`, `search no match`, `empty`, `new row`, `phone sheet`, `behind toggle`, `row actions`, `deleted`, `error`); the container rule for SCR-02/03/06.

## Inlined context

> **Workspace container.** At `≥ md` the AI section is one bordered, rounded container (`rounded-xl border bg-background`, `overflow-hidden`) inside the content area's padding (16 px), height `calc(100dvh - var(--header-height) - 2 × 16 px)`. The page still never scrolls (spec §6). Below `md` the container drops its border, radius and padding and fills the content area edge to edge. The panes are separated by one vertical border.
>
> — `screens.md §Source, «Workspace container», verbatim` · full text: [screens.md](../screens.md)

> Structure, top to bottom (per `ref/reference-empty-state.png`; pane width 16rem at `≥ md`): a top row with the search `InputGroup` (…) and, beside it, the "Conversation actions" `⋯` icon `DropdownMenu` (Delete all, as the parent); the heading "Conversations" stays in the DOM as a visually hidden `h2` (`sr-only`) … a footer that is always visible, separated by a top border: a full-width "New chat" `Button` (default variant, plus icon, links to `/ai`) above the parent's retention notice in `text-xs text-muted-foreground`. … Group headings are small muted labels (`text-xs font-normal text-muted-foreground`, `px-3 pt-4 pb-1`). Each row is a plain one-line link (`h-9 px-3 rounded-md text-sm`, title truncated with the full title and "Last message {d MMM yyyy}" in `title`; no visible date, no border, no card), hover `bg-accent/60`. The open Conversation's row carries `aria-current="page"`, `bg-accent` and `font-medium`. There is **no always-visible delete icon**: each row has a trailing `⋯` icon button (`aria-label` "Actions for {title}") that shows on row hover, on keyboard focus within the row, on the current row, and always on touch devices (`pointer: coarse`). It opens a `DropdownMenu` with "Delete" (destructive), which leads to the parent's delete `ConfirmationModal` unchanged.
>
> — `screens.md §SCR-01, intro, abridged`

> **Hard rule:** the existing layout keeps its `--cookie-banner-height` term and the `md` (768) / `xl` (1280) breakpoints with the 3-pane grid, phone sheets and the `md`–`xl` list toggle unchanged.
>
> — `screens.md §Source, «Layout and breakpoints», abridged`

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

### AC-15 (US-04) — happy path

> **Given** a Freelancer on a desktop screen with 40 Conversations and an open Conversation of 60 messages
> **When** they scroll the messages or the Conversation list
> **Then** only that area scrolls; the page itself never scrolls, the message box stays visible at the bottom and the Conversation list stays in place
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-17 (US-04) — happy path

> **Given** a Freelancer with Conversations whose last messages were today, yesterday, 7 days ago and 8 days ago
> **When** they open the AI section, and then type "inv" into the Conversation search
> **Then** the list is grouped under Today, Yesterday, Previous 7 days (the one from 7 days ago) and Older (the one from 8 days ago), with a New chat button at its bottom; the search shows only the Conversations whose titles contain "inv", ignoring case, extra spaces and look-alike letters, and says so when none match
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-19 (US-06) — happy path

> **Given** a Freelancer on a phone (a screen narrower than 768 px)
> **When** they open the AI section, switch Conversations, and open a draft's preview
> **Then** the chat fills the screen with the message box at the bottom; the Conversation list opens as its own screen or sheet and closes when they pick one; the preview opens as a full-screen sheet with the same actions as on a desktop
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)


## Checklist

- [ ] `app/(protected)/ai/layout.tsx`: padding + bordered rounded container at `md+`, edge to edge below; keep the cookie-banner term so the page never scrolls
- [ ] `components/ai/ai-workspace.tsx`: panes divided by one border; list pane 16rem; preview column without its own outer border
- [ ] `conversation-list*.tsx`: search row + actions `⋯`, sr-only `h2`, muted group labels, plain rows, row `⋯` menu → existing delete hook/dialog, footer New chat full width + retention notice
- [ ] `app/(protected)/ai/loading.tsx`: skeleton matches the new list (search, two labels, six rows)
- [ ] Rewrite superseded assertions: `ai-conversation-list.test.tsx` «shows each row with its title, last-message day» → date in the row `title`; «has a "Conversations" header» → sr-only `h2` still found by role; «gives each row a delete icon button» → row `⋯` menu → Delete reports that Conversation; `ai-delete-conversations.test.tsx` button name `Delete conversation {title}` → menu path
- [ ] New assertions: no delete button visible without hover/focus on a non-current row (`pointer: fine`), keyboard Tab reaches the row `⋯`

## Edge cases

| Case | Behaviour |
|---|---|
| Touch device | Row `⋯` always visible |
| 80-character title | Truncated; full title in `title` (existing test kept) |
| No Conversations | Empty copy; search disabled; Delete all hidden; New chat + notice stay |
| Phone (< md) | Same list in the left `Sheet`; picking a row closes it (AC-19) |

## Definition of Done

- [ ] At md and wider the AI section is one rounded bordered container in the content area with zero page scroll, the list pane shows the search row with the actions menu, small muted group labels, plain one-line truncated rows with no visible delete icon, a row ⋯ menu leading to the unchanged delete dialog, and New chat full width at the bottom, every SCR-01 state still renders, and the updated component tests pass.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
