---
id: T39
title: "Build the dashboard AI block prompt box on the PromptInput element"
layer: "ui"
deps: ["T34"]
blocks: ["T40", "T41"]
acs: ["AC-30", "AC-31"]
files_hint: ["components/dashboard/ai-block.tsx", "tests/component/dashboard-ai-block.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T39 — Build the dashboard AI block prompt box on the PromptInput element

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** T34 — Port the PromptInput and Suggestion elements onto Base UI
- **Blocks:** T40 — Register the AI elements and the changed AI components in the design system, T41 — Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines
- **Wave:** 2 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to type a request on the dashboard, see my latest Conversations there, and create an invoice with AI from the dashboard's actions
> **So that** I can use the AI from the page I open first
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

It gives the dashboard the same prompt card as the AI section.

## Screens

- SCR-09 every state (`loading`, `default`, `none yet`, `validation — empty`, `validation — too long`, `sending`, `used-up`, `error`).

## Inlined context

> **left:** a client prompt box built on the same `PromptInput` element as the chat (ADR-0010): a 2-row auto-growing `PromptInputTextarea` (placeholder "Ask about your invoices or describe one to draft", `aria-label` "Message to AI") and a round `PromptInputSubmit` (`aria-label` "Send to AI"), with the `AllowanceNotice` counter in its footer. Enter sends and Shift+Enter is a newline, as in `Composer`. Validation, hand-off and every state below are unchanged;
>
> — `screens.md §SCR-09, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** Prompt text never appears in a URL (ADR-0009); the hand-off writes the one-time `sessionStorage` entry and navigates to `/ai?handoff={id}`.
>
> — `tasks/_epic.md §Risks / Hard rules, abridged`

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

### AC-30 (US-10) — happy path

> **Given** a Freelancer with five Conversations
> **When** they open the dashboard
> **Then** they see the three latest Conversations by last message, each a link that reopens it, a link to all Conversations, and a "Create invoice with AI" action next to the dashboard's existing invoice action that opens a new Conversation ready to draft. A Freelancer with no Conversations sees that there are none yet instead of the list.
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

### AC-31 (US-10) — error

> **Given** a Freelancer on the dashboard
> **When** they send an empty prompt, or one longer than the chat's message limit
> **Then** nothing is sent and no Conversation is created; the prompt box explains that a message is needed, or how long a message may be
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)


## Checklist

- [ ] In `components/dashboard/ai-block.tsx`, rebuild the client prompt box on `PromptInput`
- [ ] Keep validation messages, counter and hand-off code untouched
- [ ] Component test: Send to AI button found by name; empty → "Type a message first."; too long → the verbatim limit message + count

## Edge cases

| Case | Behaviour |
|---|---|
| Empty prompt | "Type a message first."; nothing stored (AC-31) |
| Over 2,000 characters | Verbatim limit message + "{n} / 2,000" (AC-31) |
| Used-up | Box replaced by `AllowanceNotice` (unchanged) |

## Definition of Done

- [ ] The dashboard prompt box is a PromptInput card with the counter in its footer and a round submit labelled "Send to AI", empty and too-long prompts show the same verbatim FieldError and create nothing, a valid prompt hands off exactly as before, and dashboard-ai-block component tests stay green.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
