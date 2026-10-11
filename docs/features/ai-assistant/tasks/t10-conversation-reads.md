---
id: T10
title: "List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice"
layer: "app"
deps: ["T01", "T03"]
blocks: ["T18", "T20", "T23", "T25"]
acs: ["AC-35", "AC-36", "AC-41"]
files_hint: ["lib/services/conversations/conversations.ts", "lib/services/conversations/index.ts", "lib/services/assistant-drafts/card-view.ts", "tests/integration/services/conversations/conversation-reads.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T10 — List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice

## Place in the sequence

- **Blocked by:** T01 — Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables, T03 — Add the FORBIDDEN code, the three new error-detail kinds, the shared assistant types and the zod draft schemas · **Blocks:** T18 — Add the AI section route and sidebar entry and render the Conversation list with paging, empty state and the retention notice, T20 — Store Draft cards with one live card per Conversation and create the Draft invoice only from the Create press, T23 — Render a saved Conversation with ChatLink invoice states, the not-found page and the loading skeleton, T25 — Save each turn under the Conversation row lock with its card and metadata, and delete one or all Conversations · **Wave:** 2 — the read side of the chat aggregate that both pages and the chat route need.
- **Lane:** own lane.

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

This task lets a Freelancer see and reopen their Conversations — only their own — with every draft link showing what the invoice is now.

## Inlined context

> **Chosen:** Option 1. (**Own Prisma tables, visible content only** — … a message keeps the Freelancer's text, the Assistant's final text, link targets as ids and a reference to its Draft card. Raw tool answers are not stored.)
>
> — `adr/0008 §Decision outcome + Option 1, abridged` · full text: [ADR-0008](../adr/0008-store-conversations-in-prisma-tables-keeping-only-what-the-freelancer-saw.md)

> Flow 7 (reopen): find the Conversation by id and owner → no such Conversation, or it belongs to another Freelancer → not found, exactly as for one that never existed; found → visible messages in order, card references, linked invoice ids → read the current state of each linked invoice, owner-scoped → draft, issued, or gone → the whole exchange, each link carrying its invoice's current state. Postcondition: opening writes nothing.
>
> — `sad.md §6, Flow 7, abridged` · full text: [sad.md](../sad.md)

> **Contract gap OQ-S1** (owner `api`): `getConversation` resolves every invoice link to a `LinkedInvoiceState` (AC-36), but its return type has no field that carries the link states … **Decided here (UI side):** after each `finish` the island calls `router.refresh()`, so `cards` and link states come from `getConversation` … **Asked of `api`:** add `invoiceLinks: Record<string, LinkedInvoiceState>` (keyed by invoice id) to the `getConversation` result. No new read function.
>
> — `screens.md §Source, contract gaps, OQ-S1, abridged` · full text: [screens.md](../screens.md)

**Breakdown decision (OQ-S1):** this task adds `invoiceLinks` to the `getConversation` result as screens.md asks; it is additive and needs no new read. If the owner rules otherwise in `api`, follow `server-actions.md`.

> **Hard rule:** Another Freelancer's Customer, invoice or Conversation answers exactly as one that does not exist (AC-40, AC-41).
>
> — `sad.md §8, Authorization and tenancy, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([server-actions.md](../contracts/server-actions.md) · [data-model.md](../data-model.md) · [screens.md](../screens.md)) and follow it. Do not guess.

## Data delta

Read only:

| Table | Columns read | Index |
|---|---|---|
| `Conversation` | `id, userId, title, lastMessageAt` | list `WHERE userId ORDER BY lastMessageAt DESC` → `Conversation_userId_lastMessageAt_idx`; open `WHERE id AND userId` → PK |
| `ConversationMessage` | `id, position, role, parts, createdAt` | whole exchange `ORDER BY position`; history `ORDER BY position DESC LIMIT 40`, reversed → `ConversationMessage_conversationId_position_key` |
| `DraftCard` | `id, state, proposal, replacedById, invoiceId` | `WHERE id IN (card ids from parts) AND userId = $actor` → PK |
| `Invoice` | `id, invoiceNumber, status` | link states: the invoice ids from `parts` + card `invoiceId`s in one owner-scoped `findMany`; no state stored in the message |

— `data-model.md §Conversation, §ConversationMessage, §DraftCard access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `listConversations(actor, page?: number): Promise<ActionResult<Page<ConversationSummary>>>` — newest `lastMessageAt` first, 20 per page; page numbers through the repo's `Page<T>`; a page past the last is handled by the shared `paginate` helper.
- `getConversation(actor, id): Promise<ActionResult<{ conversation: ConversationSummary; messages: ConversationMessageView[]; cards: Record<string, DraftCardView>; invoiceLinks: Record<string, LinkedInvoiceState> }>>`

| Outcome | Result |
|---|---|
| found | `ok(…)`: messages in `position` order. Every `data-draft-card` part has its `DraftCardView` in `cards`. Every invoice link and card invoice is resolved to its current `LinkedInvoiceState` in one owner-scoped read (AC-36) |
| unknown id, or another Freelancer's | `fail('NOT_FOUND', "This conversation can't be found.")` (AC-41) |

- Internal: `loadHistory(actor, conversationId)` → the latest 40 messages in order (for the chat route); `toDraftCardView(card, invoiceStates)` in `lib/services/assistant-drafts/card-view.ts` (reused by T20).

— `contracts/server-actions.md §AI section and Conversations, abridged` · full text: [server-actions.md](../contracts/server-actions.md) · `invoiceLinks` added per `screens.md §Source, OQ-S1`

## Acceptance criteria

### AC-35 — happy path

> **Given** a Freelancer with past Conversations
> **When** they open the AI section
> **Then** they see their Conversations, newest first, each with a title and the date of its last message. Opening one shows the whole exchange, and they can continue it; each new message counts toward the allowance.
>
> — `spec.md §5, AC-35, verbatim` · full text: [spec.md](../spec.md)

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

- [ ] `listConversations`, `getConversation`, `loadHistory` — `lib/services/conversations/conversations.ts`, `lib/services/conversations/index.ts`
- [ ] Parse `parts` through the T03 schemas; collect invoice ids from `data-link` parts and card `invoiceId`s; one owner-scoped invoice read → `LinkedInvoiceState` (`DRAFT` / `ISSUED` with display status / `UNAVAILABLE`) — same file
- [ ] `toDraftCardView` (`CREATED` with NULL `invoiceId` → `invoice: { state: 'UNAVAILABLE' }`) — `lib/services/assistant-drafts/card-view.ts`
- [ ] Integration tests: order, paging, foreign id = unknown id (byte-identical failure), issued and deleted invoice states, 45 messages → history of the latest 40 in order — `tests/integration/services/conversations/conversation-reads.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Another Freelancer's Conversation id | the same `NOT_FOUND` text as an unknown id (AC-41) |
| Linked invoice deleted | `UNAVAILABLE` (AC-36) |
| Linked invoice issued since | `ISSUED` with its display status (AC-36) |
| Invoice id in parts that belongs to someone else | `UNAVAILABLE` — never its data |
| Malformed stored `parts` | fail with `FAILED` via `redactError`, never render raw JSON |
| Page past the last | shared `paginate` behaviour, like other web lists |

## Definition of Done

- [ ] Integration tests show listConversations pages 20 per page newest first, getConversation returns messages in position order with a DraftCardView per card part and a LinkedInvoiceState per invoice link (DRAFT, ISSUED, UNAVAILABLE), another Freelancer's id answers the same NOT_FOUND as an unknown id, and loadHistory returns at most the latest 40 messages in order.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
