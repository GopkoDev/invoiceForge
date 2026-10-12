---
id: T22
title: "Render Offered choices under a reply and send a press from the chat island"
layer: "ui"
deps: ["T14", "T21"]
blocks: ["T23", "T26", "T30"]
acs: ["AC-08", "AC-10", "AC-11", "AC-12", "AC-12b", "AC-13"]
files_hint: ["components/ai/offered-choices.tsx", "components/ai/chat-island.tsx", "components/ai/message-list.tsx", "docs/design-system.md", "tests/component/offered-choices.test.tsx", "tests/component/ai-chat-island.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T22 — Render Offered choices under a reply and send a press from the chat island

## Place in the sequence

- **Blocked by:** T14 — Accept choice, origin and startedFrom in the chat request and run the press path in the chat route, T21 — Follow new text within 48 px with a jump-to-latest control, and pin the word-by-word streaming
- **Blocks:** T23 — Add the workspace invoice-state store and the Draft card Preview button, T26 — Add the dashboard AI block with the prompt box hand-off, the latest Conversations and Create invoice with AI, T30 — Add e2e-through-UI tests for presses, reopen, full-height layout, empty start, phone sheets and streaming
- **Wave:** 9 (longest dependency chain); linear position T22 of T31 for the sequential in-place run.
- **Lane:** shares `docs/design-system.md` with T19; `components/ai/chat-island.tsx` with T20; `components/ai/chat-island.tsx` with T21; `components/ai/chat-island.tsx` with T23; `components/ai/chat-island.tsx` with T24; `components/ai/chat-island.tsx` with T26 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It shows the system-found options as buttons the Freelancer can press, and the chosen one afterwards.

## Inlined context

> Contract: props `offer: OfferView | undefined` (undefined → skeleton), `isLatest: boolean`, `pendingOptionId: number | null`, `onPress(offerId, optionId, label)`; pressable only when `offer.state = 'OPEN' && isLatest`; labels verbatim; `role="group"` with a kind-based `aria-label`; the chosen button secondary + check + sr-only "(chosen)" (SCR-04)
>
> — `screens.md §New components, OfferedChoices, verbatim` · full text: [screens.md](../screens.md)

> | labels loading | … a row of three button-sized `Skeleton`s |
> | pressable | `state = OPEN` and the reply is the latest one … This also applies with no allowance left (AC-11: the press is refused by the server, not disabled) |
> | pressing | … its label appears at once as the Freelancer's message (optimistic). The pressed button shows a `Spinner`, and the whole group plus the composer are disabled until the turn resolves. |
> | chosen | `state = CHOSEN` … `variant="secondary"` with a check icon and sr-only "(chosen)". All buttons are disabled |
> | inactive | `state = CLOSED` … or the reply is not the latest. All buttons are disabled, none marked |
> | refused — unavailable | `409` (AC-12b, AC-13): back to `pressable`, nothing marked. SCR-03 `choice unavailable` shows the sentence |
> | refused — used up | `429` (AC-11): back to `pressable`, nothing marked. SCR-03 `used-up` |
> | no offer | … no group is rendered |
>
> — `screens.md §SCR-04, states, abridged` · full text: [screens.md](../screens.md)

> A press sends `{ conversationId, message: label, choice: { offerId, optionId } }` with no `origin` (openapi.yaml `ChatRequest`). On a phone the buttons wrap. A label longer than the row truncates with its full text in `title`.
>
> — `screens.md §SCR-04, verbatim` · full text: [screens.md](../screens.md)

> Accessibility | Offered choices are a labelled group of buttons, with the chosen one announced as pressed or chosen.
>
> — `sad.md §8, Accessibility row, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `POST /api/chat` with `choice: { offerId, optionId }` (T14); `409 CHOICE_UNAVAILABLE`, `429 ALLOWANCE_USED_UP` handling.
- `loadConversationCards(id)` → `offers` after `finish` (T11).

— `contracts/openapi.yaml, sendChatMessage + contracts/server-actions.md §loadConversationCards, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-08 — happy path

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the chat asks which Customer they mean and shows two buttons, "Acme Corp" and "Acme GmbH", under its reply; pressing "Acme GmbH" sends that choice as their message and the chat continues with a draft card for Acme GmbH
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant

> **Given** Customers "Acme Corp" and "Аcme Corp" (the second with a Cyrillic "А"), offered as two buttons
> **When** the Freelancer presses the second button
> **Then** each button also shows its Customer's email so the two can be told apart, and the draft continues with exactly the Customer they pressed, never the look-alike one
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — domain invariant

> **Given** a Freelancer with one message left today and a reply offering two buttons
> **When** they press a button, and then press an Offered choice in the chat's next reply
> **Then** the first press is sent and counts as a message; the second is not processed, no option of that reply is marked as chosen, and the chat says today's allowance is used up and when it renews, exactly as for a typed message
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — domain invariant

> **Given** a reply with Offered choices, after which the Freelancer sent a newer message
> **When** they look at the earlier reply
> **Then** its buttons are visible but cannot be pressed, and the one they chose, if any, is marked as chosen
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-12b — authorization

> **Given** a Conversation whose latest reply offered Acme Corp and Acme GmbH
> **When** a message arrives presented as a pressed option for a record that is not among that reply's Offered choices — an option from an older reply, or a Customer of another Freelancer
> **Then** it is never applied as a choice and never reaches the model; it does not count toward the allowance, and the chat says that this option is no longer available, in the same words whether the option was outdated, belongs to another Freelancer or never existed; the draft never moves toward that record
>
> — `spec.md §5, AC-12b, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — cross-context

> **Given** a past Conversation in which the chat offered three bank accounts as buttons and the Freelancer pressed one
> **When** they reopen that Conversation days later
> **Then** the reply shows the same three options, with the pressed one marked as chosen; when the reply was the latest one and nothing was pressed, its buttons can still be pressed, and pressing one whose account has since been deleted is turned down as an option that is no longer available, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `OfferedChoices` component per the contract — `components/ai/offered-choices.tsx`
- [ ] Island: keep `offers` from page load and `loadConversationCards`; render the group for each `data-offer` part; `isLatest` = the newest assistant message; press handler sends `choice`, removes the optimistic message on 409/429 — `components/ai/chat-island.tsx`, `message-list.tsx`
- [ ] Register `OfferedChoices` (and the island's new `choice` send) — `docs/design-system.md`
- [ ] Component tests: stored labels verbatim incl. email part (AC-10); press payload; pressing state on one button; chosen and inactive (AC-12); refused 409 with the sentence (AC-12b); 429 with renewal time and nothing marked (AC-11); reopen restore (AC-13) — `tests/component/offered-choices.test.tsx`, `ai-chat-island.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| `data-offer` arrives before labels | Skeleton row until `loadConversationCards` returns |
| Allowance used up | Buttons still pressable; server refuses with 429 |
| Single-option offer | One button, pressable |
| Very long label | Truncated with full text in `title` |

## Definition of Done

- [ ] OfferedChoices renders an OfferView's stored labels verbatim in a kind-labelled group with skeleton, pressable, pressing, chosen and inactive states, a press sends { offerId, optionId } with the label as an optimistic message, 409 and 429 put the buttons back to pressable with nothing marked and show the fixed sentence or the used-up notice, and the component is registered in docs/design-system.md.
- [ ] component tests green
- [ ] design-system inventory updated
- [ ] keyboard order follows the buttons
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
