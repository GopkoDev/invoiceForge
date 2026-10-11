---
id: T25
title: "Save each turn under the Conversation row lock with its card and metadata, and delete one or all Conversations"
layer: "app"
deps: ["T10", "T20"]
blocks: ["T30", "T31"]
acs: ["AC-35", "AC-37"]
files_hint: ["lib/services/conversations/save-turn.ts", "lib/services/conversations/delete.ts", "lib/services/assistant-usage/turns.ts", "lib/actions/assistant-actions.ts", "tests/integration/services/conversations/save-turn.test.ts", "tests/integration/actions/delete-conversations.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T25 — Save each turn under the Conversation row lock with its card and metadata, and delete one or all Conversations

## Place in the sequence

- **Blocked by:** T10 — List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice, T20 — Store Draft cards with one live card per Conversation and create the Draft invoice only from the Create press · **Blocks:** T30 — Mount the AI-section modal container and confirm deleting one or all Conversations from the list and the Conversation header, T31 — Serve POST /api/chat: validate, check the Conversation, reserve a slot, stream the turn, save it, release on failure · **Wave:** 5 — the write side of the chat aggregate; persists the proposed card in the turn's transaction.
- **Lane:** shares `lib/actions/assistant-actions.ts` with T20 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** a list of my past Conversations that I can reopen and continue
> **So that** I can pick up where I left off
>
> — `spec.md §4, US-11, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to delete one or all of my Conversations, and to know they are deleted automatically after 90 days
> **So that** my customers' names and amounts do not pile up in a chat history forever
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

This task saves each exchange exactly as the Freelancer saw it, so a Conversation can be continued later, and lets the Freelancer delete one or all Conversations without touching any draft.

## Inlined context

> ```ts
> saveTurn(actor, input: { conversationId: string | null; userText: string; assistantParts: ConversationMessageView['parts']; turn: AssistantTurnMetadata }):
>   Promise<ActionResult<{ conversationId: string; title: string }>>;
> ```
> - `saveTurn` creates the Conversation when `conversationId` is null (decided at `api`, 2026-10-11).
> - It appends the two messages at the next positions under the Conversation row lock and moves `lastMessageAt`, all in one transaction.
> - `AssistantTurnMetadata` is the `AssistantTurn` row without ids.
> - A failed or unavailable turn saves only the metadata.
>
> — `contracts/server-actions.md §Chat route internals, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> - **Propose (flow 6), in the turn's transaction:** 1. `UPDATE … SET "state" = 'REPLACED' WHERE "conversationId" = $c AND "state" = 'LIVE'` 2. Insert the new `LIVE` card. 3. Set `replacedById` on the old card.
>
> — `data-model.md §DraftCard, access patterns, abridged` · full text: [data-model.md](../data-model.md)

> `data-conversation`: Sent first when the request had `conversationId = null`; the UI moves to /ai/{conversationId}.
>
> — `contracts/openapi.yaml §ConversationPart, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

**Breakdown gap OQ-T1 (raise with the owner; build as below unless told otherwise).** The card is written "in the turn's transaction" (data-model) and the new Conversation's id is streamed *first* (openapi), yet `saveTurn` runs after the reply and `DraftCard.conversationId` is NOT NULL. Reconciled here without a schema change: the route pre-generates the Conversation id (cuid) and `propose_draft` pre-generates the card id; `saveTurn` takes `conversation: { id: string; isNew: boolean }` and an optional `proposedCard: { id; request; proposal }`, and writes the Conversation (if new), both messages, the card (replace-then-insert via `insertLiveCard`, T20) and the `AssistantTurn` row in one transaction. Contract delta: the two input fields only.

> **AssistantTurn holds per-message metadata only**: kind, outcome, counted, steps, tool names, duration, tokens, cost — no text. … it survives Conversation deletion (its Conversation reference is set to null).
>
> — `sad.md §5, building-block decisions, abridged` · full text: [sad.md](../sad.md)

> Flow 8: in one transaction delete the owner's Conversations with their messages and Draft cards, detach their turn metadata → the Conversation is not this Freelancer's or is already gone → nothing deleted → not found, list refreshed; deleted → deleted. Postcondition: deleted Conversations cannot be opened, every invoice they created is unchanged.
>
> — `sad.md §6, Flow 8, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([server-actions.md](../contracts/server-actions.md) · [data-model.md](../data-model.md) §Conversation, §ConversationMessage, §AssistantTurn) and follow it. Do not guess.

## Data delta

| Table | Write | Constraint used |
|---|---|---|
| `Conversation` | insert (id pre-generated, `title` = first message trimmed to 80, `lastMessageAt` = now) or `SELECT … FOR UPDATE` by id + owner, then `lastMessageAt = now` | PK |
| `ConversationMessage` | two rows at `max(position) + 1`, `+ 2`; `role` USER / ASSISTANT; `parts` visible content only | `ConversationMessage_conversationId_position_key` |
| `DraftCard` | replace live + insert (when a card was proposed) | `DraftCard_conversationId_live_key` |
| `AssistantTurn` | one row: `topic`, `outcome` (`ANSWERED`/`CAPPED`/`FAILED`/`ALLOWANCE_USED_UP`), `counted`, `steps`, `toolNames`, `durationMs`, tokens, `costUsd` | — |
| delete | `DELETE FROM "Conversation" WHERE "userId" = $actor [AND "id" = $1]`; 0 rows = not found; messages and cards cascade, turns SET NULL | PK / index prefix |

— `data-model.md §Conversation, §ConversationMessage, §AssistantTurn, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `saveTurn` (above, with the OQ-T1 fields) and `recordTurnMetadata(actor, turn)` for turns that save no messages (`lib/services/assistant-usage/turns.ts`).
- `deleteConversation(id: string)` → `ActionResult<void>`: deleted → `ok()` (messages and Draft cards go with it, turn metadata keeps no reference, drafts unchanged, revalidates `/ai`); unknown id, or another Freelancer's → `fail('NOT_FOUND', "This conversation can't be found.")`.
- `deleteAllConversations()` → `ActionResult<{ deleted: number }>`: `ok({ deleted: 0 })` when there were none. One transaction.

— `contracts/server-actions.md §Conversations, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-35 — happy path

> **Given** a Freelancer with past Conversations
> **When** they open the AI section
> **Then** they see their Conversations, newest first, each with a title and the date of its last message. Opening one shows the whole exchange, and they can continue it; each new message counts toward the allowance.
>
> — `spec.md §5, AC-35, verbatim` · full text: [spec.md](../spec.md)

### AC-37 — happy path

> **Given** a Freelancer with several Conversations
> **When** they delete one Conversation, or delete all of them, and confirm
> **Then** the deleted Conversations disappear from the list and can no longer be opened. Every draft those Conversations created stays exactly as it was.
>
> — `spec.md §5, AC-37, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `saveTurn` with the OQ-T1 inputs, row lock, positions, title trim, `insertLiveCard`, turn row — `lib/services/conversations/save-turn.ts`
- [ ] `recordTurnMetadata` (no text by type: the input type has no string field but `toolNames`) — `lib/services/assistant-usage/turns.ts`
- [ ] `deleteConversation`, `deleteAllConversations` services — `lib/services/conversations/delete.ts`
- [ ] Server actions with session actor + `revalidatePath('/ai')` — `lib/actions/assistant-actions.ts`
- [ ] Integration tests: new Conversation with given id; two parallel `saveTurn` on one Conversation → positions 0–3 without gaps or collisions; second card replaces the first; failed turn → metadata only; delete one/all keeps invoices and detaches turns; foreign id → NOT_FOUND — `tests/integration/services/conversations/save-turn.test.ts`, `tests/integration/actions/delete-conversations.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Conversation deleted in another tab before `saveTurn` | `NOT_FOUND`; nothing written but the metadata row |
| Two turns race to add a card | Conversation row lock orders them; a P2002 loser is retried once inside the lock |
| First message of 300 characters | title = first 80, trimmed |
| `deleteAllConversations` with none | `ok({ deleted: 0 })` |
| Deleted Conversation had created a draft | the invoice stays exactly as it was (AC-37) |

## Definition of Done

- [ ] Integration tests show saveTurn creates a Conversation with its pre-generated id and an 80-character title, appends two messages at the next positions under the row lock, persists a proposed card as the only LIVE card, writes one AssistantTurn row with no text, saves only metadata for a failed turn, and deleteConversation / deleteAllConversations remove messages and cards, detach turns, keep every invoice and answer NOT_FOUND for a foreign id.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
