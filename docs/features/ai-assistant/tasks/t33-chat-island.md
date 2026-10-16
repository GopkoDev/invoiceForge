---
id: T33
title: "Build the useChat island: send only the new message, show waiting, streaming and every outcome, and keep the allowance live"
layer: "ui"
deps: ["T22", "T23", "T31"]
blocks: ["T35"]
acs: ["AC-09", "AC-10b", "AC-11", "AC-11b"]
files_hint: ["components/ai/chat-island.tsx", "components/ai/composer.tsx", "app/(protected)/ai/page.tsx", "app/(protected)/ai/[conversationId]/page.tsx", "tests/component/ai-chat-island.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T33 — Build the useChat island: send only the new message, show waiting, streaming and every outcome, and keep the allowance live

## Place in the sequence

- **Blocked by:** T22 — Build the AI start panel with example prompts, the start=draft variant and the AllowanceNotice counter and used-up modes, T23 — Render a saved Conversation with ChatLink invoice states, the not-found page and the loading skeleton, T31 — Serve POST /api/chat: validate, check the Conversation, reserve a slot, stream the turn, save it, release on failure · **Blocks:** T35 — Add Playwright flows: open the AI section, draft and create from a card, Create with AI, and the Assistant mark · **Wave:** 8 — the client side of critical flow 1.
- **Lane:** shares `app/(protected)/ai/[conversationId]/page.tsx` with T23; shares `app/(protected)/ai/page.tsx` with T18, T22 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to see how many messages I have left today and what happens when they run out
> **So that** a limit never surprises me in the middle of a task
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task is the live conversation: the Freelancer's message appears at once, the reply streams in, the counter stays honest, and every failure says what happened and costs nothing.

## Inlined context

**SCR-02 — live states this task builds (the saved exchange is T23):**

| State | Trigger / condition | Components |
|---|---|---|
| waiting | Send pressed: the message appears at once; an Assistant row shows a `Spinner` and "Thinking…" until the first words; Send and Enter are disabled while a reply is in flight (one message at a time). `data-allowance` updates the counter as soon as the slot is reserved | `Spinner` |
| streaming | Text deltas render progressively in the Assistant row (first words ≤ 3 s p95). A streamed card or link renders as it arrives; after `finish` the island calls `router.refresh()` so `cards` and link states come from `getConversation` (OQ-S1). Until then a card shows SCR-03 `loading` | `DraftCard`, `ChatLink` |
| answered | `data-outcome` `ANSWERED`: the reply stays; the counter reads one less (AC-09). All are the Assistant's own text; the UI adds nothing | — |
| partial | `data-outcome` `PARTIAL` (AC-11b): the part found, ending with the route's saved "too broad, ask a narrower question" sentence. Counted; the UI adds nothing | — |
| could-not-complete | `data-outcome` `COULD_NOT_COMPLETE`, or `503 FAILED` before the stream (AC-11): any text already streamed is discarded; the Assistant row becomes a destructive inline `Alert` "The reply couldn't be completed. Try again." with "Try again", which sends the same text as a new message. The counter returns to its earlier value (`data-allowance` after the release); not counted | `Alert`, `Button` |
| ai-unavailable | `data-outcome` `AI_UNAVAILABLE`, shown within 10 s: inline `Alert` "AI is temporarily unavailable. Try again in a few minutes. The rest of Invoice Forge works as usual." with "Try again". Not counted | `Alert`, `Button` |
| too-long | The composer text is over 2,000 characters after trimming. The client checks first: `FieldError` under the composer with the contract message verbatim "Messages can be at most 2,000 characters. Shorten it and send again." and the count "{n} / 2,000"; Send disabled; the text is kept. A `400 VALIDATION` from the route shows the same message. Not counted | `Field`, `FieldError` |
| used-up | `left = 0` on load, or `429 RATE_LIMITED` `ALLOWANCE_USED_UP` on send, including the losing tab of AC-10b. The unsent message is removed; the composer is replaced by `AllowanceNotice` (used-up mode) with the result's `error` verbatim. The exchange stays readable, links open and a live card can still be created (AC-11c) | `AllowanceNotice` |
| conversation-gone | `/api/chat` `404 NOT_FOUND` mid-session (deleted in another tab): inline `Alert` "This conversation can't be found." verbatim with "Start a new conversation →" (`/ai`); the composer is disabled | `Alert`, `buttonVariants` link |
| signed out | `401` on send → `goToSignIn()`; nothing processed or counted (AC-42) | — |

SCR-01 `sending first message`: Send on the start panel: the panel turns into the Conversation layout of SCR-02 `waiting` at once. The `data-conversation` part gives the new id; the URL becomes `/ai/{id}` without remounting the island (`history.replaceState`), and the new title heads the list.

> - **Live regions:** streamed text is not announced token by token. The finished reply is announced once through an `aria-live="polite"` region; the waiting state is an sr-only `role="status"` "Assistant is replying…".
>
> — `screens.md §SCR-02, §SCR-01 sending first message, §Source, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** Client state stays inside `useChat` plus the existing modal registry for the delete dialog. No new global store.
>
> — `sad.md §4, UI architecture, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) SCR-02 wireframes · [openapi.yaml](../contracts/openapi.yaml) `/api/chat`) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

`useChat` with a transport posting to `/api/chat` and `prepareSendMessagesRequest` sending only `{ conversationId, message }` (the server loads history itself). Reads the custom parts `data-conversation`, `data-allowance`, `data-draft-card`, `data-link`, `data-outcome`; JSON refusals `400`/`401`/`404`/`429`/`503` with the `error` text shown verbatim.

— `contracts/openapi.yaml §ChatRequest, §ChatDataPart, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-09 — happy path

> **Given** a Freelancer with a Daily message allowance of 30 who has sent 18 messages today
> **When** they send one more message
> **Then** the chat shows 11 messages left today
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10b — domain invariant

> **Given** a Freelancer with one message left today and the chat open in two browser tabs
> **When** they send a message from both tabs at the same moment
> **Then** only one message is processed and the other tab shows that today's allowance is used up
>
> — `spec.md §5, AC-10b, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — error

> **Given** a Freelancer with messages left today
> **When** a reply fails on the system's side before it is complete
> **Then** the chat says the reply could not be completed and invites them to try again, and that message does not count toward the allowance
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-11b — error

> **Given** a Freelancer with messages left today
> **When** they ask a question that needs more work than one message may use
> **Then** the chat gives the part it found, says plainly that the question was too broad to answer in full, and suggests a narrower one. The message counts toward the allowance.
>
> — `spec.md §5, AC-11b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `ChatIsland` on `useChat` (custom transport, data-part handlers, outcome rendering, `router.refresh()` after `finish`, `history.replaceState` on `data-conversation`) — `components/ai/chat-island.tsx`
- [ ] `Composer` (client 2,000-character check after trim, counter, disabled while in flight, Enter to send) — `components/ai/composer.tsx`
- [ ] Mount the island on `/ai` (start panel `onSend`) and `/ai/[conversationId]` (initial messages from `getConversation`) — `app/(protected)/ai/page.tsx`, `app/(protected)/ai/[conversationId]/page.tsx`
- [ ] Component tests with a mocked transport/stream for every state above — `tests/component/ai-chat-island.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Enter pressed twice quickly | one message |
| Text streamed then `COULD_NOT_COMPLETE` | streamed text removed, alert shown, counter restored |
| 429 on send | message removed from the list, used-up notice with the server text |
| Live card on screen when used up | card still creatable (AC-11c) |
| First message from `/ai` | URL becomes `/ai/{id}`, island not remounted |

## Definition of Done

- [ ] Component tests with a mocked transport render SCR-02 waiting, streaming, answered, partial, could-not-complete (streamed text discarded, counter restored, Try again resends), ai-unavailable, too-long (client check, Send disabled), used-up on 429 including the losing tab, conversation-gone and sending first message (URL becomes /ai/{id} without remount).
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
