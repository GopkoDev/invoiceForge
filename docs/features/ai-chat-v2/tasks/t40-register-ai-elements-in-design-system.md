---
id: T40
title: "Register the AI elements and the changed AI components in the design system"
layer: "docs"
deps: ["T36", "T37", "T38", "T39"]
blocks: []
acs: ["AC-15"]
files_hint: ["docs/design-system.md", "docs/features/ai-chat-v2/screens.md"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T40 — Register the AI elements and the changed AI components in the design system

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** T36 — Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again, T37 — Rebuild the empty state with the time-of-day greeting, the PromptInput composer and suggestion chips, T38 — Align Offered choices, the Draft card and the preview panel with the message layout, T39 — Build the dashboard AI block prompt box on the PromptInput element
- **Blocks:** — (end of the follow-up chain)
- **Wave:** 4 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It makes the new elements the reuse-first choice for later AI screens.

## Screens

- §New components («Presentation revision» table).

## Inlined context

> Registration in `docs/design-system.md` happens in `implement`.
>
> — `screens.md §New components, «Presentation revision», verbatim` · full text: [screens.md](../screens.md)

> Feature components (`ChatIsland`, `MessageList`, `Composer`, `StartPanel`, `ConversationList`, `OfferedChoices`, `DraftCard`, `InvoicePreviewPanel`, `DashboardAiBlock`) keep their contracts and compose these.
>
> — `screens.md §New components, verbatim`

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


## Checklist

- [ ] Add one row per element group (`Conversation*`, `Message*`, `PromptInput*`, `Suggestion*`, `Loader`) with location, contract, Base UI basis, deviation from upstream, licence pointer
- [ ] Update the changed component rows (presentation only)
- [ ] Flip `pending (implement)` → `registered (docs/design-system.md)` in screens.md §New components

## Edge cases

| Case | Behaviour |
|---|---|
| A contract in code differs from screens.md | The code as reviewed wins; fix the manifest row in the same commit and say so |

## Definition of Done

- [ ] docs/design-system.md lists Conversation, Message, PromptInput, Suggestion and Loader from components/ai-elements with their contracts, Base UI basis and the ADR-0010 deviations and licence note, updates the AiWorkspace, ConversationList, ChatIsland, Composer, StartPanel, OfferedChoices, DraftCard, InvoicePreviewPanel and DashboardAiBlock rows to the new presentation, and screens.md §New components marks each element registered.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
