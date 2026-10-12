---
id: T11
title: "Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen"
layer: "infra"
deps: ["T02", "T10"]
blocks: ["T12", "T13", "T18", "T27"]
acs: ["AC-12", "AC-13", "AC-18"]
files_hint: ["lib/services/conversations/save-turn.ts", "lib/services/conversations/conversations.ts", "lib/actions/assistant-actions.ts", "tests/integration/ai-chat-v2-save-turn-offers.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen

## Place in the sequence

- **Blocked by:** T02 — Promote staged migrations 01–05, apply the Prisma schema edits and extend the test factories, T10 — Build Offered choices from resolver issues and pin a chosen option into a draft request
- **Blocks:** T12 — Check a pressed choice against the stored offer and claim or release it with the allowance slot, T13 — Turn propose_draft issues into the reply's offer, apply the turn's pins, and stream the data-offer part, T18 — List every Conversation summary and the latest three, and add the grouping and title-search helpers, T27 — Cover offers, chosen options, message origins and start points in the data export and account deletion
- **Wave:** 4 (longest dependency chain); linear position T11 of T31 for the sequential in-place run.
- **Lane:** shares `lib/actions/assistant-actions.ts` with T17; `lib/services/conversations/conversations.ts` with T18 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a new Conversation to greet me with the message box in the middle and suggested requests
> **So that** I know what to ask before I type anything
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

It persists Offered choices with their reply so a reopened Conversation shows the same buttons, inactive or chosen as they were.

## Inlined context

> One transaction under the Conversation row lock, in this order: create the Conversation (with `startedFrom`) when `conversationId` is null; when `userOrigin` is not `PRESSED`, close the Conversation's `OPEN` offer (`CLOSED`, no choice; AC-12); append the two messages (`origin` on the USER row, `NULL` on the ASSISTANT row); insert the turn's offer `OPEN` tied to the reply; move `lastMessageAt`. A failed or unavailable turn saves only the metadata, as in the parent, and so closes nothing.
>
> — `contracts/server-actions.md §saveTurn, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> ```ts
> saveTurn(actor, input: { conversationId: string | null; startedFrom?: ConversationStartPoint;
>   userText: string; userOrigin: MessageOrigin; assistantMessageId: string;
>   assistantParts; offer: { kind; lineIndex; request: DraftRequest; options: StoredOfferOption[] } | null;
>   turn: AssistantTurnMetadata }): Promise<ActionResult<{ conversationId: string; title: string }>>;
> ```
>
> — `contracts/server-actions.md §saveTurn, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> The result gains `offers: Record<string, OfferView>` keyed by `offerId`: one per `data-offer` part, read owner-scoped by `conversationId` (`ChoiceOffer_conversationId_idx`). Messages gain `origin`. … Reopening writes and counts nothing.
>
> — `contracts/server-actions.md §getConversation, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> `loadConversationCards(id)` ✎ The result gains `offers: Record<string, OfferView>`, exactly as `getConversation` returns them. The island calls it after each finished reply (parent rule), which is how a freshly streamed `data-offer` gets its labels
>
> — `contracts/server-actions.md §loadConversationCards, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **The order of offer writes keeps "one open offer per Conversation"**: a typed or dashboard message closes the open offer when it is saved at the end of its turn, before that turn's own offer is stored (Flows 4 and 6), and a press claims its offer before the next offer of that turn is stored (Critical flow 1). The partial unique index never sees two open rows.
>
> — `sad.md §6, Flags, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table / column | Use here |
|---|---|
| `ChoiceOffer` insert | `userId`, `conversationId`, `messageId` = pre-generated reply cuid, `kind`, `lineIndex`, `request`, `options`, `state = 'OPEN'` |
| `ChoiceOffer` close | `UPDATE … SET state = 'CLOSED' WHERE conversationId = $c AND state = 'OPEN'` (partial index) |
| `ConversationMessage.origin` | written on USER rows, NULL on ASSISTANT |
| `Conversation.startedFrom` | written once at creation |

— `data-model.md §ChoiceOffer access patterns «Close» / «Store the next offer» / «Reopen», abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `saveTurn` ✎, `getConversation` ✎ (`offers`, message `origin`), `loadConversationCards` ✎ (`offers`).

— `contracts/server-actions.md, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-12 — domain invariant

> **Given** a reply with Offered choices, after which the Freelancer sent a newer message
> **When** they look at the earlier reply
> **Then** its buttons are visible but cannot be pressed, and the one they chose, if any, is marked as chosen
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — cross-context

> **Given** a past Conversation in which the chat offered three bank accounts as buttons and the Freelancer pressed one
> **When** they reopen that Conversation days later
> **Then** the reply shows the same three options, with the pressed one marked as chosen; when the reply was the latest one and nothing was pressed, its buttons can still be pressed, and pressing one whose account has since been deleted is turned down as an option that is no longer available, without counting
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — happy path

> **Given** a Freelancer who opens a new Conversation
> **When** the page appears, and then they send the first message
> **Then** they first see a greeting, the message box in the middle and suggested requests; after sending, the message box moves to the bottom with an animation and the reply appears above it. A Freelancer whose device asks for reduced motion sees the move without animation. Pressing a suggested request only fills the message box. A new Conversation left without a message is not saved and never appears in the Conversation list.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Extend `saveTurn` input and transaction order (create with `startedFrom` → close open offer unless `PRESSED` → messages with origin → offer insert → `lastMessageAt`) — `lib/services/conversations/save-turn.ts`
- [ ] `getConversation` returns `offers` (OfferView: no `ref`, no `request`) and message `origin` (NULL USER → `TYPED`) — `lib/services/conversations/conversations.ts`
- [ ] `loadConversationCards` returns `offers` — `lib/actions/assistant-actions.ts`
- [ ] Integration tests: typed message closes the earlier offer with no choice and stores the new one (AC-12); reopen returns three account options with the chosen one (AC-13); a Conversation exists only after its first message, with `startedFrom` (AC-18); failed turn closes nothing; foreign Conversation not found — `tests/integration/ai-chat-v2-save-turn-offers.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `userOrigin = 'PRESSED'` | Does not close the offer the press claimed |
| Failed or unavailable turn | Metadata only; the open offer stays open |
| Turn with no offer | Only the close (if typed) and the messages |
| Two concurrent turns in one Conversation | Serialized by the Conversation row lock; the partial unique index is the backstop |

## Definition of Done

- [ ] saveTurn creates a Conversation with startedFrom on its first message, writes origin on the USER row and NULL on the reply, closes the open offer for a typed or dashboard message before inserting the turn's own OPEN offer tied to the pre-generated reply id, saves nothing but metadata for a failed turn, and getConversation and loadConversationCards return offers keyed by offerId, proven by integration tests.
- [ ] integration tests green on a throwaway database
- [ ] existing save-turn and Conversation tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
