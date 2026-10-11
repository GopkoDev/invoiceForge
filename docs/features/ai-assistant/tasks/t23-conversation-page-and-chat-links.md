---
id: T23
title: "Render a saved Conversation with ChatLink invoice states, the not-found page and the loading skeleton"
layer: "ui"
deps: ["T10", "T18"]
blocks: ["T28", "T30", "T33"]
acs: ["AC-36", "AC-41"]
files_hint: ["app/(protected)/ai/[conversationId]/page.tsx", "app/(protected)/ai/[conversationId]/loading.tsx", "app/(protected)/ai/[conversationId]/not-found.tsx", "components/ai/message-list.tsx", "components/ai/chat-link.tsx", "components/ai/conversation-header.tsx", "docs/design-system.md", "tests/component/ai-conversation-page.test.tsx", "tests/component/chat-link.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T23 — Render a saved Conversation with ChatLink invoice states, the not-found page and the loading skeleton

## Place in the sequence

- **Blocked by:** T10 — List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice, T18 — Add the AI section route and sidebar entry and render the Conversation list with paging, empty state and the retention notice · **Blocks:** T28 — Build the DraftCard component in every SCR-03 state and wire Create to createDraftFromCard, T30 — Mount the AI-section modal container and confirm deleting one or all Conversations from the list and the Conversation header, T33 — Build the useChat island: send only the new message, show waiting, streaming and every outcome, and keep the allowance live · **Wave:** 4 — the page the chat island and the Draft card render into.
- **Lane:** shares `app/(protected)/ai/[conversationId]/page.tsx` with T33; shares `components/ai/conversation-header.tsx` with T30; shares `components/ai/message-list.tsx` with T28; shares `docs/design-system.md` with T19, T22, T28 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** a list of my past Conversations that I can reopen and continue
> **So that** I can pick up where I left off
>
> — `spec.md §4, US-11, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the chat to see only my own data and only while I am signed in
> **So that** no one else's data reaches me and no one reaches mine through it
>
> — `spec.md §4, US-13, verbatim` · full text: [spec.md](../spec.md)

This task lets a Freelancer reopen a Conversation and see the whole exchange, with every invoice link showing what the invoice is now — and nothing at all for a Conversation that is not theirs.

## Inlined context

**SCR-02 — Conversation, states this task builds (the live chat states are T33):**

| State | Trigger / condition | Components |
|---|---|---|
| loading | Page request in flight: new `[conversationId]/loading.tsx` with three alternating message skeletons and a composer skeleton | `Skeleton` |
| default | `getConversation` → `ok` (AC-35; flow 7 found). Header: the title, "New conversation" (→ `/ai`) and a `⋯` menu with "Delete conversation". The whole exchange in order: Freelancer messages right-aligned, Assistant messages left-aligned as plain text with their `ChatLink`s and Draft cards (SCR-03) in part order. Composer and `AllowanceNotice` (counter) at the bottom. Scrolled to the newest message | `ScrollArea`, `NEW: ChatLink`, `NEW: DraftCard`, `Textarea`, `Button`, `NEW: AllowanceNotice`, `DropdownMenu` |
| links | Invoice links show their current state (AC-36; flow 7): a draft → "INV-0043 · Draft", opens the editor; issued since → "INV-0042" + `InvoiceStatusBadge`, opens the editor; deleted since → "INV-0043 · No longer available", not a link. Page links → "{page title} →" to the route from the fixed app map (AC-07; SCR-09, SCR-10, SCR-07) | `NEW: ChatLink` |
| not-found | `getConversation` → `NOT_FOUND`: unknown id or another Freelancer's → SCR-12, the same for both (AC-41) | — |
| error | `getConversation` fails → `unwrapPageResult` → existing `(protected)/error.tsx` (`LoadError`) | `LoadError` |

**SCR-12:** new `app/(protected)/ai/[conversationId]/not-found.tsx`, composed from the existing not-found component: "This conversation can't be found." / "It may have been deleted." / "Back to AI →" (`/ai`). Nothing about the record is revealed.

> - **Reply rendering:** Assistant text renders as **plain text** with line breaks kept (`whitespace-pre-wrap`), never as Markdown or HTML. Links come only from `data-link` and `data-draft-card` parts; a URL the model writes stays plain text (sad.md §8 Links, AC-07).
> - **Live regions:** streamed text is not announced token by token. The finished reply is announced once through an `aria-live="polite"` region.
>
> | `ChatLink` | … Contract: props `link: AppLink`, `state?: LinkedInvoiceState`; `UNAVAILABLE` renders plain text, never an anchor | pending |
>
> — `screens.md §SCR-02, §SCR-12, §Source, §New components, abridged` · full text: [screens.md](../screens.md)

Draft card parts render a placeholder slot (`renderCard(cardId)`) that T28 fills with `DraftCard`; the header's "Delete conversation" calls an `onDelete` prop that T30 wires to SCR-04.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) SCR-02 / SCR-12 wireframes) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `getConversation(actor, id)` → `{ conversation: ConversationSummary; messages: ConversationMessageView[]; cards: Record<string, DraftCardView>; invoiceLinks: Record<string, LinkedInvoiceState> }`; `NOT_FOUND` → `notFound()`. `AppLink` = `{ kind: 'invoice', invoiceId, label }` | `{ kind: 'page', page: AppPageKey, senderProfileId? }`; page keys resolve through the app map of T13 (`lib/ai/app-map.ts`).

— `contracts/server-actions.md §getConversation, abridged` (`invoiceLinks` per `screens.md §Source, OQ-S1`) · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-36 — cross-context

> **Given** a past Conversation that created a draft which has since been issued or deleted
> **When** the Freelancer reopens that Conversation
> **Then** the draft's link shows the invoice's current state — issued, or no longer available — instead of presenting it as a draft
>
> — `spec.md §5, AC-36, verbatim` · full text: [spec.md](../spec.md)

### AC-41 — authorization

> **Given** a Freelancer's Conversation
> **When** another Freelancer opens a link to it
> **Then** they are told it cannot be found, exactly as for a Conversation that never existed
>
> — `spec.md §5, AC-41, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RSC page reading `getConversation`, `notFound()` on `NOT_FOUND` — `app/(protected)/ai/[conversationId]/page.tsx`
- [ ] Loading skeleton and SCR-12 not-found — `app/(protected)/ai/[conversationId]/loading.tsx`, `not-found.tsx`
- [ ] `MessageList` (plain-text Assistant rows, part order, card slot, `aria-live` region for finished replies) — `components/ai/message-list.tsx`
- [ ] `ChatLink` (invoice states, page links via the app map; `UNAVAILABLE` plain text) — `components/ai/chat-link.tsx`
- [ ] `ConversationHeader` (title, New conversation, ⋯ menu; "← All conversations" below `lg`) — `components/ai/conversation-header.tsx`
- [ ] Register `ChatLink` in the design canon — `docs/design-system.md`
- [ ] Component tests — `tests/component/ai-conversation-page.test.tsx`, `tests/component/chat-link.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Assistant text contains `https://evil.example` | plain text, no anchor (AC-07) |
| Invoice deleted since | "· No longer available", not a link (AC-36) |
| Foreign or unknown id | SCR-12, identical (AC-41) |
| Below `lg` | only the Conversation, with "← All conversations" |

## Definition of Done

- [ ] Component tests render SCR-02 default and links (draft, issued with InvoiceStatusBadge, no longer available as plain text, page links from the app map), SCR-12 for NOT_FOUND with the same copy for unknown and foreign ids, and Assistant text as plain text where a model-written URL is never an anchor.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
