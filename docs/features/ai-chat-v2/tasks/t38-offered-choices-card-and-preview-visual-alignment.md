---
id: T38
title: "Align Offered choices, the Draft card and the preview panel with the message layout"
layer: "ui"
deps: ["T36"]
blocks: ["T40", "T41"]
acs: ["AC-08", "AC-20"]
files_hint: ["components/ai/offered-choices.tsx", "components/ai/draft-card.tsx", "components/ai/invoice-preview-panel.tsx", "tests/component/offered-choices.test.tsx", "tests/component/draft-card.test.tsx", "tests/component/invoice-preview-panel.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "done"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T38 — Align Offered choices, the Draft card and the preview panel with the message layout

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** T36 — Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again
- **Blocks:** T40 — Register the AI elements and the changed AI components in the design system, T41 — Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines
- **Wave:** 3 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It makes choices, cards and the preview read as part of the reply instead of separate boxes.

## Screens

- SCR-04 (all states), SCR-05 (`created (draft)`, `preview open`, `created, issued`, `created, no longer available`), SCR-06 (all states; presentation only).

## Inlined context

> Presentation (ADR-0010): the group sits inside the assistant `MessageContent`, under the `MessageResponse` text with an 8 px gap, aligned with the text (not under the avatar). Buttons are `rounded-full` outline chips, the same shape as the SCR-02 `Suggestion` chips, so a choice reads as part of the reply; states, labels, ARIA and the press contract are unchanged.
>
> — `screens.md §SCR-04, intro, verbatim` · full text: [screens.md](../screens.md)

> Presentation (ADR-0010): the card sits inside the assistant `MessageContent`, full column width (`max-w-3xl` column), `rounded-xl` with the container's border colour, so cards, choices and text share one left edge. States and copy are unchanged.
>
> — `screens.md §SCR-05, verbatim`

> Presentation (ADR-0010): at `≥ md` the panel is the right-most pane of the bordered workspace container, separated by one vertical border (no own outer border, shadow or radius); its header is `h-12` like the chat header so the two header rows line up. The phone sheet is unchanged. States, copy, addresses and focus rules are unchanged.
>
> — `screens.md §SCR-06, verbatim`

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

### AC-20 (US-07) — happy path

> **Given** a Conversation in which the Freelancer pressed Create and a Draft invoice exists
> **When** they press Preview on that card
> **Then** a panel opens beside the messages with the same invoice preview the editor shows for that draft, an "Open in editor" link and an Issue button; the messages stay visible on a desktop
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)


## Checklist

- [ ] `offered-choices.tsx`: chip shape only; chosen = secondary + check + sr-only "(chosen)"; `aria-disabled` behaviour untouched
- [ ] `draft-card.tsx`: radius/border tokens only
- [ ] `invoice-preview-panel.tsx`: header `h-12`, drop outer border/shadow in the column variant
- [ ] No assertion in the three component tests changes except class-name pins, if any (list them)

## Edge cases

| Case | Behaviour |
|---|---|
| Label longer than the row | Truncates with full text in `title` (unchanged) |
| Chosen offer on reopen | Secondary + check, all disabled (AC-08) |
| Preview at md–xl | List hidden, toggle in header (unchanged) |

## Definition of Done

- [ ] Offered choices render as rounded-full chips inside the assistant MessageContent, the Draft card spans the centred column with the container border colour, the preview panel at md and wider is the right-most pane with an h-12 header aligned with the chat header and no own outer border, every SCR-04/05/06 state and label is unchanged, and the offered-choices, draft-card and preview-panel component tests stay green.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
