---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-13"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0010 — Build the AI section from our own chat elements, ported from Vercel AI Elements onto Base UI

- **Status:** Accepted (amended 2026-10-13 by ADR-0012)
- **Date:** 2026-10-13
- **Deciders:** Dmytro Hopko (owner decision after the shipped-but-unpushed build; recorded post-hoc by the decide-adr agent in an autonomous run)

## Context

The AI section was built (T19–T26) from hand-made components in `components/ai/`. The owner rejected the result before push: the user message is a full-width black pill, the "could not be completed" state is a bare full-width red card, the Conversation list is cramped with a trash icon on every row, and the header is empty (`ref/current-as-built-bad.png`). The owner wants the presentation rewritten inside this feature to the layout of `ref/reference-empty-state.png`, with no behaviour change. Vercel AI Elements is the reference component set for AI SDK chat UIs, but it is built on shadcn's Radix style. This project's shadcn uses the `base-vega` style over `@base-ui/react` (`components.json`, `components/ui/*`). This decision missed the `design` pass because it follows the owner's review of the built UI.

## Decision drivers

- One primitive system: SAD §2 Conventions pin shadcn/ui `base-vega` and the `docs/design-system.md` inventory. A second headless library would split focus, portal and theming behaviour.
- No new runtime dependency (SAD §2 Technical: "This feature adds no runtime dependency"; no animation library).
- Behaviour is fixed by spec §5 and the shipped tests, which must not be weakened. In particular:
  - message text is plain text, never Markdown, HTML or a model-written link (ai-assistant AC-07, SAD §8 "Untrusted text"; pinned by `tests/component/ai-conversation-page.test.tsx`);
  - the newest text is followed while the end is no more than **48 px** out of view (spec §6, QG-3).
- Quality goal 3 (SAD §1): a workspace that never makes the Freelancer hunt. The owner judged the hand-built layout as failing it.
- Owner decision (2026-10-13): use AI Elements as the base, not hand-made components.

## Considered options

1. **Install AI Elements as published (its shadcn registry) beside Base UI.** Fast to start, but it pulls Radix primitives (`@radix-ui/*` via the Radix-style shadcn components it imports) into a Base UI project, plus `streamdown` with its code, math, mermaid and CJK plugins, `motion`, `nanoid` and `use-stick-to-bottom`. That gives two primitive systems and several new runtime dependencies.
2. **Keep the hand-built `components/ai/*` and only restyle them.** No porting cost, but the owner rejected this direction, and the hand-built pieces do not share an anatomy that later AI screens can reuse.
3. **Port the needed elements onto Base UI as our own set in `components/ai-elements/`.** Keep AI Elements' anatomy and prop names. Rebuild each element on `@base-ui/react` through our `components/ui` primitives. Swap the Radix-only and new-dependency parts for what the project already has.

## Decision outcome

**Chosen:** Option 3. It meets the owner's direction and keeps one primitive system and zero new runtime dependencies. It also keeps both behaviour rules that the published elements would break: `MessageResponse` renders streamdown Markdown, and `Conversation` uses `use-stick-to-bottom`, whose near-bottom threshold is a hard-coded 70 px (`STICK_TO_BOTTOM_OFFSET_PX`, v1.1.6) against our 48 px.

**What is ported** (from `vercel/ai-elements` `packages/elements/src` at commit `6a9d5b1`). Names follow upstream so the docs at ai-sdk.dev/elements stay a usable reference:

| Our file | Elements | Built on | Deviation from upstream |
|---|---|---|---|
| `conversation.tsx` | `Conversation`, `ConversationContent`, `ConversationEmptyState`, `ConversationScrollButton` | `div` scroll area, `Button` | Driven by our `useFollowLatest` hook (48 px, reduced motion, jump control), not `use-stick-to-bottom`. No `ConversationDownload`. |
| `message.tsx` | `Message` (`from`), `MessageContent`, `MessageAvatar`, `MessageResponse`, `MessageActions`, `MessageAction` | `Avatar`, `Button`, `Tooltip` (Base UI) | `MessageResponse` renders plain text with line breaks kept (no streamdown, no Markdown, no links). `MessageAvatar` comes from the earlier upstream API. No branch selector. |
| `prompt-input.tsx` | `PromptInput`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputTools`, `PromptInputSubmit` (status `ready` / `submitted` / `streaming` / `error`) | `InputGroup`, `Textarea`, `Button` | No attachments, screenshots, action menu, model select or `nanoid`. Enter sends and Shift+Enter adds a line, as today. |
| `suggestion.tsx` | `Suggestions`, `Suggestion` | `Button` (outline, pill) | Wraps onto lines instead of a horizontal `ScrollArea`. |
| `loader.tsx` | `Loader` | `Spinner` | Replaces upstream `Shimmer` (needs `motion`). Static under `prefers-reduced-motion`. |

Feature components in `components/ai/` (workspace, list, chat island, offered choices, draft card, preview panel, dashboard block) keep their behaviour and data flow and compose these elements. Domain pieces are not "elements".

**Licence.** AI Elements is Apache License 2.0 ("Copyright 2023 Vercel, Inc."; the repository has no NOTICE file). Each ported file starts with a header comment: adapted from Vercel AI Elements (URL, file, commit), Copyright 2023 Vercel, Inc., Apache-2.0, "Modified: rebuilt on @base-ui/react; see ADR-0010". `components/ai-elements/LICENSE` carries the full Apache-2.0 text, and `components/ai-elements/NOTICE` names the source and the changes (Apache-2.0 §4(a)–(b)).

## Consequences

**Positive**
- One primitive system and no new runtime dependency. Bundle, CSP and supply chain stay as they are.
- A reusable chat anatomy (Conversation, Message, PromptInput, Suggestion) that later AI screens and the dashboard block share.
- Both behaviour rules (plain-text replies, 48 px follow) are kept by construction, and the existing tests keep guarding them.

**Negative**
- We own the ported code. Upstream fixes do not arrive by `shadcn add`, and syncing needs a manual diff against the pinned commit.
- Porting and restyling cost: the visual baselines and many e2e selectors change (follow-up tasks T33+), on a feature that had already passed review.
- Our elements differ from the upstream docs in places (plain-text `MessageResponse`, own follow hook, no attachments), so the deviation table above must be read alongside ai-sdk.dev/elements.

**Neutral**
- Markdown in replies is still out of scope. Adopting `streamdown` (2.6.0 is the newest release older than two weeks) later needs a spec change to AC-07's plain-text rule and its own ADR, with raw HTML and model-written links disabled.
- `use-stick-to-bottom` (1.1.6) can be reconsidered if a later version makes the threshold configurable.

## Links

- Spec: [[../spec.md]] §1 "Following new text", §5 (all ACs unchanged), §6 (48 px follow, accessibility, reduced motion); ai-assistant AC-07
- SAD: [[../sad.md]] §2 Conventions, §5 "Full-height workspace", §8 "Untrusted text" / "Accessibility", §9
- Screens: [[../screens.md]] (layout per `ref/reference-empty-state.png`)
- Related ADR: [[0005-give-a-saved-conversation-and-an-open-preview-their-own-addresses-and-keep-a-new-conversation-at-ai]] (addresses unchanged); ai-assistant ADR-0002 (hybrid RSC + client island, unchanged)
- Upstream: https://github.com/vercel/ai-elements (Apache-2.0), https://ai-sdk.dev/elements
