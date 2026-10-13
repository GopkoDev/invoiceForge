---
id: T41
title: "Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines"
layer: "tests"
deps: ["T35", "T36", "T37", "T38", "T39"]
blocks: []
acs: ["AC-08", "AC-15", "AC-16", "AC-17", "AC-18", "AC-19", "AC-20", "AC-30", "AC-33"]
files_hint: ["tests/e2e/ai-chat-v2-chat.spec.ts", "tests/e2e/ai-chat-v2-preview-dashboard.spec.ts", "tests/e2e/ai-assistant-flows.spec.ts", "tests/e2e/ai-assistant.spec.ts", "tests/e2e/ai-chat-v2-chat.spec.ts-snapshots/", "tests/e2e/ai-chat-v2-preview-dashboard.spec.ts-snapshots/", "tests/e2e/ai-assistant-flows.spec.ts-snapshots/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T41 — Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** T35 — Rebuild the workspace as a bordered container and the Conversation list as plain rows with a row menu for delete, T36 — Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again, T37 — Rebuild the empty state with the time-of-day greeting, the PromptInput composer and suggestion chips, T38 — Align Offered choices, the Draft card and the preview panel with the message layout, T39 — Build the dashboard AI block prompt box on the PromptInput element
- **Blocks:** — (end of the follow-up chain)
- **Wave:** 4 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It proves the rewrite kept every flow working and fixes the new look as the baseline.

## Screens

- SCR-01, SCR-02, SCR-03, SCR-04, SCR-06, SCR-09 (layout and the states the e2e specs already cover).

## Inlined context

> | Chat, a reply's text appears progressively, word by word, never as one block once it is complete | consecutive words shown 20–50 ms apart once the model has sent them; the first word is never held back (…) |
>
> — `spec.md §6, NFR table, abridged` · full text: [spec.md](../spec.md)

> **How verify:** An e2e layout check at 360 × 640, 768 × 1024 and 1440 × 900 (`document.scrollingElement.scrollHeight === innerHeight`, composer box in view). … The existing e2e accessibility suite extended to the three surfaces.
>
> — `sad.md §10, QG-3, abridged`

> Visual baselines are Linux-only and authoritative. To refresh on purpose, in a commit of their own: start the Playwright Linux browser container, run with `PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3300/ PW_SNAPSHOT_PLATFORM=linux pnpm exec playwright test <spec> --project=chromium --update-snapshots`, then `docker rm -f pwbrowser`.
>
> — `tests/e2e/README.md §Layout baselines, abridged`

> **Hard rule:** e2e runs locally before ship (no e2e in CI): check `docker info`, keep the machine awake, clean leaked testcontainers.
>
> — `tasks/_epic.md §Risks / Hard rules, verbatim`

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

### AC-08 (US-03) — happy path

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the chat asks which Customer they mean and shows two buttons, "Acme Corp" and "Acme GmbH", under its reply; pressing "Acme GmbH" sends that choice as their message and the chat continues with a draft card for Acme GmbH
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

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

### AC-17 (US-04) — happy path

> **Given** a Freelancer with Conversations whose last messages were today, yesterday, 7 days ago and 8 days ago
> **When** they open the AI section, and then type "inv" into the Conversation search
> **Then** the list is grouped under Today, Yesterday, Previous 7 days (the one from 7 days ago) and Older (the one from 8 days ago), with a New chat button at its bottom; the search shows only the Conversations whose titles contain "inv", ignoring case, extra spaces and look-alike letters, and says so when none match
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-18 (US-05) — happy path

> **Given** a Freelancer who opens a new Conversation
> **When** the page appears, and then they send the first message
> **Then** they first see a greeting, the message box in the middle and suggested requests; after sending, the message box moves to the bottom with an animation and the reply appears above it. A Freelancer whose device asks for reduced motion sees the move without animation. Pressing a suggested request only fills the message box. A new Conversation left without a message is not saved and never appears in the Conversation list.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-19 (US-06) — happy path

> **Given** a Freelancer on a phone (a screen narrower than 768 px)
> **When** they open the AI section, switch Conversations, and open a draft's preview
> **Then** the chat fills the screen with the message box at the bottom; the Conversation list opens as its own screen or sheet and closes when they pick one; the preview opens as a full-screen sheet with the same actions as on a desktop
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-20 (US-07) — happy path

> **Given** a Conversation in which the Freelancer pressed Create and a Draft invoice exists
> **When** they press Preview on that card
> **Then** a panel opens beside the messages with the same invoice preview the editor shows for that draft, an "Open in editor" link and an Issue button; the messages stay visible on a desktop
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-30 (US-10) — happy path

> **Given** a Freelancer with five Conversations
> **When** they open the dashboard
> **Then** they see the three latest Conversations by last message, each a link that reopens it, a link to all Conversations, and a "Create invoice with AI" action next to the dashboard's existing invoice action that opens a new Conversation ready to draft. A Freelancer with no Conversations sees that there are none yet instead of the list.
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

### AC-33 (US-11) — happy path

> **Given** a reply of several sentences
> **When** the chat writes it
> **Then** the Freelancer sees its words appear progressively, never the whole text at once after it is complete; when they reopen the Conversation later, the saved reply is shown whole at once
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)


## Checklist

- [ ] `docker info` first; run with `caffeinate`; afterwards list leftover testcontainers (never prune volumes)
- [ ] Update selectors only where markup changed (row delete via `⋯` menu, greeting text, error-as-message, submit button name); keep every behavioural expectation
- [ ] Add: centred column width ≤ 768 px at 1440 × 900; no row delete button visible without hover; could-not-complete → `Try again` inside `[data-role=assistant]` re-sends once
- [ ] Retake the 8 AI baselines (`ai-section-default`, `ai-draft-card-live`, `ai-draft-card-created`, `ai-v2-new-conversation`, `ai-v2-offered-choices-pressable`, `ai-v2-offered-choices-chosen`, `ai-v2-preview-panel`, `ai-v2-dashboard-ai-block`) in a commit of their own; open each new PNG and compare with `ref/reference-empty-state.png`; record what changed per image in the commit body
- [ ] Confirm the editor baselines (`editor-layout.spec.ts-snapshots/`) are unchanged

## Edge cases

| Case | Behaviour |
|---|---|
| Docker down | Not a red of this change; start Docker and rerun |
| Font fetch flake in the Linux container | Retry; then clean leaked Postgres |
| A baseline diff outside the AI section | Stop: the rewrite leaked; fix before retaking |

## Definition of Done

- [ ] All AI e2e specs pass locally against the new presentation with selectors updated only where markup changed, new checks prove the centred column is at most 768 px wide at 1440x900, no delete button is visible without hover, and the could-not-complete state shows Try again inside an assistant message, the accessibility scan has no serious or critical violation, and the eight AI Linux baselines are retaken with every diff inspected and recorded.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] Full local e2e run green (all specs, not only AI) before the baseline commit.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
