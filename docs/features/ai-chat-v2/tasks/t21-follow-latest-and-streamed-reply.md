---
id: T21
title: "Follow new text within 48 px with a jump-to-latest control, and pin the word-by-word streaming"
layer: "ui"
deps: ["T20"]
blocks: ["T22", "T30"]
acs: ["AC-16", "AC-33"]
files_hint: ["components/ai/use-follow-latest.ts", "components/ai/message-list.tsx", "components/ai/chat-island.tsx", "tests/unit/follow-latest.test.ts", "tests/component/ai-follow-latest.test.tsx", "tests/component/ai-streamed-text.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T21 — Follow new text within 48 px with a jump-to-latest control, and pin the word-by-word streaming

## Place in the sequence

- **Blocked by:** T20 — Redesign the empty Conversation start with suggested requests and the composer move, and send the start point
- **Blocks:** T22 — Render Offered choices under a reply and send a press from the chat island, T30 — Add e2e-through-UI tests for presses, reopen, full-height layout, empty start, phone sheets and streaming
- **Wave:** 8 (longest dependency chain); linear position T21 of T31 for the sequential in-place run.
- **Lane:** shares `components/ai/chat-island.tsx` with T20; `components/ai/chat-island.tsx` with T22; `components/ai/chat-island.tsx` with T23; `components/ai/chat-island.tsx` with T24; `components/ai/chat-island.tsx` with T26 — serialized in id order.

## Screens

- **SCR-03** states `streaming`, `following` and `scrolled up` (screens.md §SCR-03; traceability added by review 2026-10-13 R1-U7).

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a reply's text to appear word by word as it is written
> **So that** I see the chat working and can start reading at once
>
> — `spec.md §4, US-11, verbatim` · full text: [spec.md](../spec.md)

It keeps the reply being written in view without yanking the Freelancer away from what they scrolled up to read.

## Inlined context

> **Following new text.** The messages count as "at the bottom" while their end is no more than 48 px out of view; further up, the Freelancer has scrolled up.
>
> — `spec.md §1, interview decisions, verbatim` · full text: [spec.md](../spec.md)

> Follow-to-latest | the newest text is in view within 100 ms of arriving while the end of the messages is no more than 48 px out of view; 0 jumps while they have scrolled further up | component test with a scripted stream
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

> Chat, a reply's text appears progressively, word by word, never as one block once it is complete | consecutive words shown 20–50 ms apart once the model has sent them; the first word is never held back (time to the first visible words stays as in ai-assistant §6, p95 ≤ 3 s)
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

> **Streaming** (inline). The shipped per-word pacing (`WORD_DELAY_MS = 20`, first word unpaced) already meets spec §6. This feature pins it with a browser test and leaves it unchanged.
> **Following new text** is a small in-house hook: the end of the messages within 48 px counts as at the bottom, and a jump-to-latest control appears otherwise.
>
> — `sad.md §5, building-block decisions, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-16 — happy path

> **Given** a Freelancer reading the latest reply at the bottom of the messages
> **When** a new reply is being written
> **Then** the messages follow the new text while their end is no more than 48 px out of view; when they have scrolled further up to read an earlier message, the view stays where they are and a control lets them jump back to the latest message
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-33 — happy path

> **Given** a reply of several sentences
> **When** the chat writes it
> **Then** the Freelancer sees its words appear progressively, never the whole text at once after it is complete; when they reopen the Conversation later, the saved reply is shown whole at once
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Pure `isAtBottom(scrollHeight, scrollTop, clientHeight, threshold = 48)` + unit test (48 → true, 49 → false) — `components/ai/use-follow-latest.ts`, `tests/unit/follow-latest.test.ts`
- [ ] Hook: follows on content growth while at bottom; exposes `showJump` and `jumpToLatest()`; no auto-scroll otherwise — same file
- [ ] Wire into the messages `ScrollArea` with a "Jump to latest" button (keyboard reachable) — `components/ai/message-list.tsx`, `chat-island.tsx`
- [ ] Component tests with a scripted stream (deltas 20–50 ms apart): in view within 100 ms at ≤ 48 px; 0 position changes further up; control returns to the end; visible text grows ≥ 3 steps, first word immediate; saved reply whole — `tests/component/`

## Edge cases

| Case | Behaviour |
|---|---|
| Freelancer scrolls back down within 48 px | Following resumes; control hides |
| Reopened Conversation | Scrolled to the newest message; saved replies shown whole |
| Reduced motion | Jump is instant, no smooth scroll |

## Definition of Done

- [ ] A follow-to-latest hook treats an end no more than 48 px out of view as at the bottom, keeps the newest text in view within 100 ms of each delta there, makes no position change when scrolled further up and shows a jump-to-latest control, a component test shows streamed text growing word by word with the first word unpaced, and a reopened reply renders whole.
- [ ] unit + component tests green
- [ ] `WORD_DELAY_MS` unchanged
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
