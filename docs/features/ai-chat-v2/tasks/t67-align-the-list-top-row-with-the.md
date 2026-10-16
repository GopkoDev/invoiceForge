---
id: T67
title: "Align the list top row with the chat header, size every skeleton to its content, and level the avatar with the first line"
layer: "ui"
deps: ["T66"]
blocks: ["T68"]
acs: ["AC-50", "AC-51", "AC-53"]
files_hint: ["components/ai/conversation-list-client.tsx", "components/ai/conversation-header.tsx", "app/(protected)/ai/loading.tsx", "app/(protected)/ai/[conversationId]/loading.tsx", "components/ai-elements/message.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

# T67 — Align the list top row with the chat header, size every skeleton to its content, and level the avatar with the first line

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** T66 — Keep the Conversation list mounted in the AI layout and update it from chat events · **Blocks:** T68 — Add e2e-through-UI tests for forms, Markdown, aligned layout, stable skeletons and list-keeping switches, and retake Linux baselines · **Wave:** 2 (longest dependency chain inside T50+).
- **Lane:** shares `components/ai-elements/message.tsx`, `components/ai/conversation-list-client.tsx` with T62, T66 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It removes the visual jumps and misalignments of screenshots 23 and 24.

## Inlined context

> Header line: From `md` the list's top row and the chat header are both `h-12` (48 px) with `border-b`; the search `InputGroup` is `h-8` … Skeletons at final size: every skeleton reuses the real component's box … the chat pane loading has the real `h-12` header … the composer placeholder at the real composer's min height … Avatar on the first line: an assistant `Message` is `flex items-start gap-3`; `MessageAvatar` sits in a `h-6` box … with the 24 px avatar centred.
>
> — `screens.md §Source, Owner feedback revision (2026-10-13), abridged` · full text: [screens.md](../screens.md)

> | Header alignment | 0 px difference … | Skeleton stability | ≤ 1 px movement … layout shift score ≤ 0.01 | Avatar alignment | within 1 px |
>
> — `spec.md §6, rows, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-50 — happy path

> **Given** a Freelancer on a screen 768 px wide or wider with a saved Conversation open
> **When** they look at the top of the workspace
> **Then** the Conversation list's search row and the chat header have the same height, and their bottom borders form one straight line across both panes
>
> — `spec.md §5, AC-50, verbatim` · full text: [spec.md](../spec.md)

### AC-51 — happy path

> **Given** a Freelancer opening the AI section or a Conversation over a slow connection
> **When** the loading placeholders are replaced by the loaded list, header, messages and message box
> **Then** nothing that was already on screen moves: each placeholder had the size and position of what replaced it
>
> — `spec.md §5, AC-51, verbatim` · full text: [spec.md](../spec.md)

### AC-53 — happy path

> **Given** an assistant reply of a single line, and another of several lines
> **When** they are shown
> **Then** each avatar is level with the first line of its message: the avatar's middle and the first line's middle are at the same height
>
> — `spec.md §5, AC-53, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] list top row `h-12`, search `h-8`, `⋯` `size-8`
- [ ] layout loading = whole workspace (hard load); page loading = chat pane only, built from the real primitives
- [ ] assistant message avatar box `h-6`, first Markdown block no top margin
- [ ] component tests where measurable; e2e boxes in T68

## Edge cases

| Case | Behaviour |
|---|---|
| /ai before the first save | no chat header (screens.md rule); list border only |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] component tests pass
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T67`
