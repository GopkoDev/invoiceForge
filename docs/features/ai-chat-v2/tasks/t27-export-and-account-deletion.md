---
id: T27
title: "Cover offers, chosen options, message origins and start points in the data export and account deletion"
layer: "app"
deps: ["T11"]
blocks: []
acs: ["AC-34"]
files_hint: ["lib/services/account/account.ts", "tests/integration/ai-chat-v2-export.test.ts", "tests/contract/ai-chat-v2-export.contract.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T27 — Cover offers, chosen options, message origins and start points in the data export and account deletion

## Place in the sequence

- **Blocked by:** T11 — Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen
- **Blocks:** nothing (leaf)
- **Wave:** 5 (longest dependency chain); linear position T27 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the privacy page, my data export and account deletion to cover everything the chat stores
> **So that** I can trust what happens to my Conversations, choices and prompts
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

It lets the Freelancer take with them, and delete, everything the chat now stores.

## Inlined context

> `exportVersion` goes from `'2.2'` to `'2.3'` (additive only):
> ```ts
> conversations: Array</* parent */ & {
>   startedFrom: ConversationStartPoint;
>   messages: Array</* parent */ & {
>     origin: MessageOrigin | null;
>     offer: { kind; options: Array<{ optionId; label }>; state; chosenOptionId: number | null; createdAt: string } | null;
>   }>;
> }>;
> ```
> - Offers export their labels and the chosen option, not their record references or stored draft request …
> - Invoice rows gain `issuedFromChat` automatically
>
> — `contracts/server-actions.md §Data export, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> `ChoiceOffer` rows cascade with their Conversation, message and user (data-model), so `deleteAccount`, `deleteConversation`, `deleteAllConversations` and the purge step need no new statement.
>
> — `contracts/server-actions.md §Account deletion, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Read: `ChoiceOffer` by `conversationId`, `ConversationMessage.origin`, `Conversation.startedFrom`, `Invoice.issuedFromChat`. Delete: existing cascades.

— `data-model.md §ChoiceOffer access patterns «Export», abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `GET /api/user/export` → export 2.3.

— `contracts/server-actions.md §Data export, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-34 — cross-context

> **Given** a Freelancer who used the chat, pressed offered buttons and sent a prompt from the dashboard
> **When** they download their data export, and later delete their account
> **Then** the export includes every Conversation with its messages, the Offered choices and the ones chosen, whether each message was typed, pressed or sent from the dashboard, and where each Conversation was started; deleting the account deletes all of it with the rest of their data
>
> — `spec.md §5, AC-34, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Extend `getAccountExport` and bump `exportVersion` — `lib/services/account/account.ts`
- [ ] Integration: offers with options and chosen option, origins, start point; only this Freelancer's; `deleteAccount` → 0 rows in every AI table; deleting one Conversation drops its offers, keeps drafts — `tests/integration/ai-chat-v2-export.test.ts`
- [ ] Contract: 2.3 shape — `tests/contract/ai-chat-v2-export.contract.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Assistant message | `origin: null` |
| Reply without an offer | `offer: null` |
| 90-day purge | Offers go with the Conversation |

## Definition of Done

- [ ] The export is version 2.3 and holds every Conversation's startedFrom, each message's origin and each reply's offer with its labels, state and chosen option (no record references, no stored request), invoices carry issuedFromChat, and account deletion leaves no ChoiceOffer, message or Conversation row.
- [ ] integration + contract tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
