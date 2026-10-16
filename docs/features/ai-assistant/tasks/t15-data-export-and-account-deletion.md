---
id: T15
title: "Add Conversations and the AI counters to the data export 2.2 and prove account deletion leaves no AI row"
layer: "ports"
deps: ["T01"]
blocks: []
acs: ["AC-39"]
files_hint: ["lib/services/account/account.ts", "app/api/user/export/route.ts", "tests/integration/api/user-export.test.ts", "tests/integration/actions/account-deletion.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T15 — Add Conversations and the AI counters to the data export 2.2 and prove account deletion leaves no AI row

## Place in the sequence

- **Blocked by:** T01 — Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables · **Blocks:** nothing — a leaf of the graph · **Wave:** 2 — needs only the tables.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to delete one or all of my Conversations, and to know they are deleted automatically after 90 days
> **So that** my customers' names and amounts do not pile up in a chat history forever
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

This task puts Conversations and the AI counters into the Freelancer's data export and proves that deleting the account removes every AI row.

## Inlined context

> Flow 12: download the export → read the owner's Conversations with messages, daily message counts, key draft counts and lift times → this Freelancer's rows only → the export file, now including Conversations and AI counters. Delete the account → in the existing account-deletion transaction delete Conversations, messages, Draft cards, turn metadata, allowance and key draft rows, repeat marks, with the rest of their data → any delete fails → rolled back, account not deleted.
>
> — `sad.md §6, Flow 12, abridged` · full text: [sad.md](../sad.md)

> - **Per-day message counts** per Freelancer, and **per-key draft counts and cap-lift times**. Aggregates only, listed in the data export, removed with the account.
>
> — `spec.md §6.1, Personal data touched, abridged` · full text: [spec.md](../spec.md)

> **Hard rule:** **`assistantKeyId` must be omitted** (`omit: { assistantKeyId: true }`): a Personal key's id never leaves the database in the export (mcp-server AC-25).
>
> — `contracts/server-actions.md §Data export, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([server-actions.md](../contracts/server-actions.md) · [data-model.md](../data-model.md)) and follow it. Do not guess.

## Data delta

Read only (export) — `Conversation` + `ConversationMessage` (by position) + `DraftCard` by `userId`; `MessageAllowanceDay` by `userId`; `PersonalKey.canCreateDrafts` and `PersonalKeyDraftDay` by the Freelancer's key ids. Deletion: no new statement — every new row cascades from `User` or `PersonalKey` after the existing invoice delete (data-model §Prisma schema edits).

## API contract

`getAccountExport` / `GET /api/user/export` ✎ — `exportVersion` goes from `'2.1'` to `'2.2'` (additive only). Added:

```ts
conversations: Array<{
  title: string; createdAt: string; lastMessageAt: string;
  messages: Array<{ role: 'user' | 'assistant'; createdAt: string; text: string; links: AppLink[]; draftCardIds: string[] }>;
  draftCards: Array<{ id: string; state: DraftCardState; createdAt: string; proposal: DraftProposal; invoiceId: string | null }>;
}>;
messageAllowanceDays: Array<{ day: string /* yyyy-MM-dd */; used: number }>;
personalKeys: Array</* existing */ & {
  canCreateDrafts: boolean;
  draftDays: Array<{ day: string; created: number; allowance: number; lastLiftedAt: string | null }>;
}>;
```

- `AssistantTurn` rows and repeat marks are not exported.
- Invoice rows gain `assistantOrigin`, `assistantKeyName` and `issuedAt` automatically; `assistantKeyId` is omitted.
- `deleteAccount` — unchanged signature; the existing transaction removes every new row through the cascades.

— `contracts/server-actions.md §Data export + §Account deletion, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-39 — cross-context

> **Given** a Freelancer with Conversations
> **When** they download their data export, and later delete their account
> **Then** the export includes their Conversations, and deleting the account deletes every Conversation along with the rest of their data
>
> — `spec.md §5, AC-39, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Bump `exportVersion` to `2.2`; add `conversations`, `messageAllowanceDays`, key `canCreateDrafts` + `draftDays`; `omit: { assistantKeyId: true }` on invoices — `lib/services/account/account.ts`
- [ ] Route unchanged except the payload — `app/api/user/export/route.ts`
- [ ] Export integration test: every new field, owner-only rows, no `assistantKeyId`, no `AssistantTurn`, no repeat marks — `tests/integration/api/user-export.test.ts`
- [ ] Account-deletion integration test: seed every AI table for two users, delete one, assert zero AI rows of that user and the other user's rows intact — `tests/integration/actions/account-deletion.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Freelancer with no Conversations | `conversations: []`, `messageAllowanceDays: []` |
| Read-only key | `canCreateDrafts: false`, `draftDays: []` |
| Card whose invoice was deleted | `invoiceId: null` |
| Another Freelancer's rows | never in the export |
| A delete inside the transaction fails | rolled back, account kept (existing behaviour) |

## Definition of Done

- [ ] Integration tests show GET /api/user/export returns exportVersion 2.2 with conversations (messages, cards), messageAllowanceDays and each key's canCreateDrafts and draftDays, never assistantKeyId, AssistantTurn rows or repeat marks, and that deleteAccount leaves no AI row of the Freelancer.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
