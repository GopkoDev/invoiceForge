---
id: T37
title: "Rebuild the empty state with the time-of-day greeting, the PromptInput composer and suggestion chips"
layer: "ui"
deps: ["T34", "T36"]
blocks: ["T40", "T41"]
acs: ["AC-18", "AC-30", "AC-31"]
files_hint: ["components/ai/start-panel.tsx", "components/ai/composer.tsx", "components/ai/chat-island.tsx", "app/(protected)/ai/page.tsx", "lib/helpers/greeting.ts", "app/globals.css", "tests/unit/greeting.test.ts", "tests/component/ai-start-panel.test.tsx", "tests/component/ai-handoff.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T37 — Rebuild the empty state with the time-of-day greeting, the PromptInput composer and suggestion chips

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** T34 — Port the PromptInput and Suggestion elements onto Base UI, T36 — Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again
- **Blocks:** T40 — Register the AI elements and the changed AI components in the design system, T41 — Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines
- **Wave:** 3 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** shares `components/ai/chat-island.tsx` with T36 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** a new Conversation to greet me with the message box in the middle and suggested requests
> **So that** I know what to ask before I type anything
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

It makes the empty state match the reference: a large greeting, a big prompt card and chips.

## Screens

- SCR-02 every state (`loading`, `default`, `suggestion picked`, `start=draft`, `too-long`, `sending (composer moves)`, `handoff`, `handoff missing`, `used-up`, `used-up from Create with AI`, `used-up on send`, `left without sending`, `error`).

## Inlined context

> **Greeting** (presentation only; nothing is counted or sent). Line 1, `text-3xl font-medium` (`text-2xl` below `md`): "Good morning, {first name}" from 05:00 to 11:59, "Good afternoon, {first name}" from 12:00 to 17:59, "Good evening, {first name}" otherwise, by the Freelancer time zone at render time, computed on the server (no hydration mismatch). `{first name}` is the first word of the account name; with no name the line is "Good morning" (etc.) with no comma. Line 2, same size: "How can I help with " followed by an accent span "your invoices today?". The accent is a text gradient from `--chart-3` to `--chart-5` (dark theme: `--chart-1` to `--chart-2`) with a solid `text-primary` fallback under `forced-colors`; it keeps at least 3:1 contrast as large text. The line is one `h1` for screen readers. The first build's sub-line (…) is dropped; the placeholder stays "Ask a question or describe an invoice".
>
> — `screens.md §SCR-02, «Greeting», abridged` · full text: [screens.md](../screens.md)

> | start=draft | … Greeting line 1 as `default`; line 2 "Let's draft *an invoice.*" (accent on "an invoice."), and under it in `text-sm text-muted-foreground` "Describe it in one sentence. You'll see a card to check before anything is created." Placeholder `e.g. "Invoice Acme for 20 hours of consulting at $50"`. Suggestion 1 only. The first message is sent with `startedFrom` from the address |
>
> — `screens.md §SCR-02, state table, abridged`

> Suggested requests (…) as `Suggestion` chips (outline, `rounded-full`, `size="sm"`, a small leading icon each) in a wrapping `Suggestions` row left-aligned under the composer: 1. "Invoice Acme for 20 hours of consulting at $50" 2. "Who owes me money right now?" 3. "What's overdue today?" 4. "Which bank accounts do I have?"
>
> — `screens.md §SCR-02, abridged`

> **Hard rule:** the composer move (≈250 ms translate, `motion-reduce:transition-none`), the hand-off consumption and `startedFrom` are behaviour and stay untouched.
>
> — `screens.md §Source, «Motion», abridged`

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

### AC-18 (US-05) — happy path

> **Given** a Freelancer who opens a new Conversation
> **When** the page appears, and then they send the first message
> **Then** they first see a greeting, the message box in the middle and suggested requests; after sending, the message box moves to the bottom with an animation and the reply appears above it. A Freelancer whose device asks for reduced motion sees the move without animation. Pressing a suggested request only fills the message box. A new Conversation left without a message is not saved and never appears in the Conversation list.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

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

- [ ] RED: `tests/unit/greeting.test.ts` — boundaries 04:59/05:00/11:59/12:00/17:59/18:00 in a non-UTC zone, first word of the name, no name → no comma
- [ ] `lib/helpers/greeting.ts` (pure, isomorphic) and `app/(protected)/ai/page.tsx` passes `{ greeting }` from the session name + Freelancer time zone
- [ ] `app/globals.css`: the accent gradient utility with light/dark stops and a `forced-colors` fallback
- [ ] `start-panel.tsx` on `ConversationEmptyState` + `PromptInput` + `Suggestions`; `composer.tsx` composes `PromptInput` keeping validation, counter, Enter rules and `FieldError`
- [ ] `chat-island.tsx`: only the prop plumbing for the greeting and the composer element (move animation unchanged)
- [ ] Rewrite superseded assertions: the old greeting "Hi! What can I help you with?" and sub-line → the new greeting; suggestion chips found by role `button` with the same four texts

## Edge cases

| Case | Behaviour |
|---|---|
| Account with no name | "Good evening" with no comma |
| Freelancer zone differs from the browser | Server-computed greeting; no hydration warning |
| Used-up | Composer and chips replaced by `AllowanceNotice`, greeting stays |
| Reduced motion | Composer jumps to the bottom without transition (AC-18) |
| Suggestion pressed | Fills and focuses; nothing sent or counted (AC-18) |

## Definition of Done

- [ ] /ai shows the two-line greeting computed on the server in the Freelancer time zone with the first name and the accent span, a centred PromptInput card with the counter and round send button, and the four Suggestion chips that only fill the box; start=draft, used-up, handoff and the composer move with its reduced-motion variant behave as before; Composer keeps its validation on PromptInput; a unit test pins the greeting rule and the start-panel and handoff component tests stay green.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] axe: no colour-contrast violation on the greeting in light and dark.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
