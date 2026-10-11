---
id: T20
title: "Store Draft cards with one live card per Conversation and create the Draft invoice only from the Create press"
layer: "app"
deps: ["T06", "T10", "T16"]
blocks: ["T25", "T27", "T28"]
acs: ["AC-11c", "AC-13", "AC-14", "AC-14b", "AC-18"]
files_hint: ["lib/services/assistant-drafts/cards.ts", "lib/actions/assistant-actions.ts", "tests/integration/services/assistant-drafts/create-from-card.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T20 — Store Draft cards with one live card per Conversation and create the Draft invoice only from the Create press

## Place in the sequence

- **Blocked by:** T06 — Write the Assistant origin once at creation, set issuedAt when an invoice first leaves DRAFT, and expose assistantMark on invoice reads, T10 — List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice, T16 — Resolve draft lines against the catalogue and custom prices, apply the quantity and unit defaults and finish resolveDraftRequest · **Blocks:** T25 — Save each turn under the Conversation row lock with its card and metadata, and delete one or all Conversations, T27 — Add the propose_draft tool that resolves the Freelancer's own words into a pending Draft card or into questions, T28 — Build the DraftCard component in every SCR-03 state and wire Create to createDraftFromCard · **Wave:** 4 — ADR-0007 write path; needs the resolver, the origin columns and the card view.
- **Lane:** shares `lib/actions/assistant-actions.ts` with T25 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to see how many messages I have left today and what happens when they run out
> **So that** a limit never surprises me in the middle of a task
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to describe an invoice in one sentence, check the proposed draft, and create it with one press
> **So that** I get a ready-to-review Draft invoice without filling the editor by hand
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task is the only way a chat draft comes into existence: the Freelancer's Create press on a card they own, which re-checks the card against today's data and creates exactly one draft.

## Inlined context

> **Chosen:** Option 1. (**Server-side card rows** — `propose_draft` stores the structured request, the resolved content and a content fingerprint as a Draft card (status `live` / `replaced` / `created`, invoice id once created); the Create press is a server action that locks the card, re-resolves, compares fingerprints and creates in the same transaction.) A row gives one place to lock against a double press, an explicit `replaced` state for AC-14b and an invoice link for AC-36.
>
> — `adr/0007 §Decision outcome + Option 1, abridged` · full text: [ADR-0007](../adr/0007-store-draft-cards-server-side-and-create-only-from-a-create-server-action.md)

> Critical flow 2: lock the card row owned by the Freelancer → card already created → link to the draft created the first time; card replaced by a newer one → replaced, points to the newer card; card live → re-resolve the stored request against current data → content differs from the confirmed card → mark the card replaced and store an updated card → updated card, confirm again; content matches → create the Draft invoice with origin chat and mark the card created, one transaction → draft link. Result, never counted as a message.
>
> — `sad.md §6, critical flow 2, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** The model has no create tool in the chat. `propose_draft` only stores a Draft card, and a chat draft is created only by the Freelancer's Create server action on a card they own (ADR-0007). … No Assistant can issue, send, edit or delete an invoice.
>
> — `sad.md §8, Write safety, abridged` · full text: [sad.md](../sad.md)

> | Draft created after the Create press, p95 | ≤ 2 s server-side | spans in error tracking |
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

> Invoice numbers allocated under a sender-profile row lock (architecture-hardening ADR-0005).
>
> — `sad.md §2, Conventions, abridged` · full text: [sad.md](../sad.md)

**Open item OQ-A1** (api-sync-report, owner `sequences`): sad §6 flow 2 has no branch for "re-resolve yields issues"; the contract's `NEEDS_ANSWERS` result below is what to build.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([server-actions.md](../contracts/server-actions.md) §createDraftFromCard · [data-model.md](../data-model.md) §DraftCard) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `DraftCard.state` | `DraftCardState` | NOT NULL DEFAULT `LIVE` | `LIVE` → `REPLACED` / `OUTDATED` / `CREATED`; only `LIVE` can create |
| `DraftCard.request` | JSONB | NOT NULL | re-resolved at every Create press |
| `DraftCard.proposal` | JSONB | NOT NULL | compared with the re-resolved content |
| `DraftCard.replacedById` | TEXT | NULL, FK self SET NULL | the newer card |
| `DraftCard.invoiceId` | TEXT | NULL, FK → `Invoice` SET NULL | set with `CREATED` |
| `Invoice.assistantOrigin` | enum | NULL | `CHAT` on create (via T06's origin argument) |

- **Replace the live card (shared helper):** 1. `UPDATE … SET "state" = 'REPLACED' WHERE "conversationId" = $c AND "state" = 'LIVE'` 2. insert the new `LIVE` card 3. set `replacedById` on the old card. The order matters: inserting first would hit the partial unique index.
- **Create press, in one transaction:** `SELECT … FROM "DraftCard" WHERE "id" = $1 AND "userId" = $actor FOR UPDATE`, then by state: `CREATED` → return the `invoiceId` link; `REPLACED` or `OUTDATED` → return the `replacedById` card; `LIVE` → re-resolve the stored `request` — content differs → mark this card `OUTDATED` and insert the updated `LIVE` card, in the order above; otherwise create the invoice (origin `CHAT`) and set `CREATED` and `invoiceId`. The row lock makes a repeated or reconnected press wait and then see `CREATED`.

— `data-model.md §DraftCard, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`createDraftFromCard(cardId: string)` → `ActionResult<CreateFromCardResult>` (critical flow 2; AC-13, AC-14, AC-14b, AC-18, AC-11c)

```ts
type CreateFromCardResult =
  | { kind: 'CREATED'; invoiceId: string; invoiceNumber: string }          // AC-13
  | { kind: 'ALREADY_CREATED'; invoice: LinkedInvoiceState }               // AC-14 (UNAVAILABLE if deleted since)
  | { kind: 'REPLACED'; newerCardId: string }                              // AC-14b
  | { kind: 'OUTDATED'; card: DraftCardView }                              // AC-18: the updated LIVE card, confirm again
  | { kind: 'NEEDS_ANSWERS'; issues: DraftIssue[] };
```

| Outcome | Result |
|---|---|
| live, content matches | `ok({ kind: 'CREATED', … })` — one transaction: lock, re-resolve with today's data, create the Draft invoice with the card's content, `assistantOrigin = CHAT`, a system-assigned number, card `CREATED` with `invoiceId`. Nothing is issued or sent |
| already `CREATED` | `ok({ kind: 'ALREADY_CREATED', … })` — creates nothing |
| `REPLACED` | `ok({ kind: 'REPLACED', … })` |
| live, content differs (price, Customer renamed, profile, account, or "today") | `ok({ kind: 'OUTDATED', card })` — this card `OUTDATED`, updated `LIVE` card stored and returned. Time alone never outdates a card |
| live, re-resolve yields issues | `ok({ kind: 'NEEDS_ANSWERS', issues })` — card `OUTDATED` with no successor; nothing created |
| unknown card, or another Freelancer's | `fail('NOT_FOUND', 'This draft card is no longer available.')` |
| unexpected failure | `fail('FAILED', "The draft couldn't be created. Try again.")` |

The action never touches the Daily message allowance and never calls the model. It does not append a message.

— `contracts/server-actions.md §createDraftFromCard, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-11c — domain invariant

> **Given** a Freelancer who has used their whole Daily message allowance today, with a draft card on screen
> **When** they press Create on that card
> **Then** the Draft invoice is created as in AC-13, because a Create press is not a message
>
> — `spec.md §5, AC-11c, verbatim` · full text: [spec.md](../spec.md)

### AC-13 — happy path

> **Given** the draft card from AC-12
> **When** the Freelancer presses Create
> **Then** a Draft invoice exists with exactly the card's content and a system-assigned invoice number, and the chat answers with a link that opens it in the editor; nothing is issued or sent
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — domain invariant

> **Given** a draft card that was already used to create a draft
> **When** the Freelancer presses Create again, or the page reconnects and repeats the press
> **Then** no second draft is created and the chat shows the link to the draft created the first time
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-14b — domain invariant

> **Given** a draft card for 20 hours, after which the Freelancer wrote "make it 25 hours" and got a new card
> **When** they press Create on the first card
> **Then** nothing is created; the first card shows that it was replaced and points to the newer card, which is the only one that can create a draft
>
> — `spec.md §5, AC-14b, verbatim` · full text: [spec.md](../spec.md)

### AC-18 — cross-context

> **Given** a draft card on screen, and the Freelancer then changes Acme Corp's custom price in another tab
> **When** they press Create on the old card
> **Then** no draft is created from the outdated card; the chat shows an updated card with the new price and asks them to confirm again, so a draft never differs from the card they confirmed. At every Create press the card is rebuilt from the same request and the current data. If any value differs, the card is outdated: a price, the Customer (renamed or gone), the sender profile or bank account, or "today" in the Freelancer time zone, such as a card from a Conversation reopened on a later day. A card never goes out of date because of time alone.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `insertLiveCard(tx, { userId, conversationId, id, request, proposal })` with the replace order — `lib/services/assistant-drafts/cards.ts`
- [ ] `createFromCard(actor, cardId, now)`: lock, state switch, re-resolve with today in the Freelancer zone, compare proposals ignoring nothing but `invoiceNumber`, create via `createInvoice(actor, toInvoiceFormInput(p), { origin: 'CHAT' }, tx)` — `lib/services/assistant-drafts/cards.ts`
- [ ] `createDraftFromCard` server action (session actor, `inOutcomeSpan`, revalidate) — `lib/actions/assistant-actions.ts`
- [ ] Integration tests: AC-13; two concurrent presses → one invoice (AC-14); replaced (AC-14b); custom price changed and a card from yesterday → OUTDATED (AC-18); Customer deleted → NEEDS_ANSWERS; allowance at 30 → still creates (AC-11c); foreign card → NOT_FOUND — `tests/integration/services/assistant-drafts/create-from-card.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Press on a card whose invoice was deleted since | `ALREADY_CREATED` with `UNAVAILABLE` |
| Same content, only hours passed (same local day) | creates — time alone never outdates |
| Card from a Conversation reopened on a later day | `OUTDATED` (issue date changed) (AC-18) |
| Number allocation fails | whole transaction rolls back; card stays `LIVE`; `FAILED` |
| Allowance used up | creates normally (AC-11c) |
| `OUTDATED` card pressed again | returns its `replacedById` card, like `REPLACED` |

## Definition of Done

- [ ] Integration tests on Postgres show a press on a live matching card creates exactly one Draft invoice with origin CHAT and marks the card CREATED, two concurrent presses create one invoice, a replaced card returns REPLACED with the newer id, a changed custom price or a new local day returns OUTDATED with an updated LIVE card, a vanished Customer returns NEEDS_ANSWERS, and the action never touches the allowance.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
