---
id: T17
title: "Add the loadInvoicePreview and issueFromPreview server actions"
layer: "ports"
deps: ["T16"]
blocks: ["T23"]
acs: ["AC-20", "AC-21", "AC-22", "AC-23", "AC-27", "AC-36"]
files_hint: ["lib/actions/assistant-actions.ts", "lib/services/assistant-drafts/cards.ts", "tests/integration/ai-chat-v2-preview-actions.test.ts", "tests/contract/ai-chat-v2-preview-actions.contract.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T17 — Add the loadInvoicePreview and issueFromPreview server actions

## Place in the sequence

- **Blocked by:** T16 — Guard updateInvoiceStatus with an optional expectedVersion and set issuedFromChat on that path
- **Blocks:** T23 — Add the workspace invoice-state store and the Draft card Preview button
- **Wave:** 3 (longest dependency chain); linear position T17 of T31 for the sequential in-place run.
- **Lane:** shares `lib/actions/assistant-actions.ts` with T11 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** to open a created draft's preview from its card in the chat
> **So that** I can check exactly what the Customer would receive without leaving the Conversation
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to issue a draft from its preview after one confirmation, under the editor's rules
> **So that** checking and issuing an Assistant draft is one short step where I created it
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It gives the chat panel an owner-scoped way to load a draft's preview and issue it, never counted as a message.

## Inlined context

> | a `CREATED` Draft card of this Freelancer whose invoice exists | `ok({ kind: 'AVAILABLE', invoice, version, state })` … |
> | a `CREATED` card whose `invoiceId` was cleared (the invoice was deleted) | `ok({ kind: 'UNAVAILABLE' })` … |
> | no card with this id for this Freelancer, another Freelancer's card, or a card that is not `CREATED` | `fail('NOT_FOUND', "This invoice can't be found.")` — the same words for every case (AC-22) |
> | unexpected failure | `fail('FAILED', "The preview couldn't be loaded. Try again.")` |
>
> — `contracts/server-actions.md §loadInvoicePreview, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> Input: `invoiceId` is a `RecordId`; `expectedVersion` an integer ≥ 0 … Calls `updateInvoiceStatus(actor, invoiceId, 'PENDING', { expectedVersion })` and, on success, sets `Invoice.issuedFromChat = true` in the same locked write.
> | unknown invoice or another Freelancer's | `fail('NOT_FOUND', "This invoice is no longer available.")` |
> | no longer `DRAFT` | `fail('CONFLICT', 'This invoice has already been issued.', { details: { kind: 'ALREADY_ISSUED', invoice } })` |
> | `version` ≠ `expectedVersion` | `fail('CONFLICT', 'This draft was changed after you opened the preview. Check it and issue again.', { details: { kind: 'CHANGED_ELSEWHERE', currentVersion } })` |
> | a draft rule … fails | `fail('VALIDATION', <the editor's message, verbatim>, { fieldErrors })` |
> | unexpected failure | `fail('FAILED', "The invoice couldn't be issued. Try again.")` |
>
> — `contracts/server-actions.md §issueFromPreview, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> Never a message, never counted, works with the allowance used up (AC-27). The model has no tool that reaches it (AC-24). … Revalidates the invoice list and dashboard paths. Span `invoices.issue-from-preview`, ≤ 2 s p95 server-side (spec §6). Metadata only.
>
> — `contracts/server-actions.md §issueFromPreview, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **Chosen:** Option 1. It is the same pattern as `loadConversationCards` (a small owner-scoped read action called from the island).
>
> — `adr/0006 §Decision outcome, abridged` · full text: [adr/0006](../adr/0006-load-the-chats-invoice-preview-through-an-owner-scoped-server-action-and-the-shared-document-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Read: `DraftCard` (`id`, `state = CREATED`, `invoiceId`, Conversation owner) joined to `Invoice` (`version`, `status`). Write via T16 only.

— `sad.md §6, Flags «Draft card by Conversation … joined to its invoice», abridged` · full text: [sad.md](../sad.md)

## API contract

- `loadInvoicePreview(cardId) → ActionResult<{ kind: 'AVAILABLE'; invoice; version; state } | { kind: 'UNAVAILABLE' }>`
- `issueFromPreview(invoiceId, expectedVersion) → ActionResult<{ status; version; invoice: LinkedInvoiceState }>`

— `contracts/server-actions.md §Assistant actions, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-20 — happy path

> **Given** a Conversation in which the Freelancer pressed Create and a Draft invoice exists
> **When** they press Preview on that card
> **Then** a panel opens beside the messages with the same invoice preview the editor shows for that draft, an "Open in editor" link and an Issue button; the messages stay visible on a desktop
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — error

> **Given** a draft created in the chat and since deleted in the editor
> **When** the Freelancer presses Preview on its card
> **Then** the panel says the invoice is no longer available and offers no Issue button, and the card shows the same
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — authorization

> **Given** two Freelancers
> **When** the second one tries to open the preview of a draft that belongs to the first one
> **Then** they are told it cannot be found, exactly as for an invoice that never existed
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — happy path

> **Given** an open preview of an Assistant draft for Acme Corp of 1,000.00 USD
> **When** the Freelancer presses Issue and confirms in the dialog that names the Customer, the total and the currency and says that its lines and amounts can no longer change once issued
> **Then** the invoice is issued through the same path as issuing from the editor and keeps the invoice number it got when it was created; the preview, the card and every link to it in the Conversation show it as issued, and the Assistant-draft mark disappears as for any issued Assistant draft
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

### AC-27 — domain invariant

> **Given** a Freelancer who has used their whole Daily message allowance today, with a created draft's preview open
> **When** they issue it
> **Then** the invoice is issued, because opening a preview and issuing are not messages and never count toward the allowance
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

### AC-36 — authorization

> **Given** a Visitor who is not signed in
> **When** they try to reach the AI section or the dashboard's prompt box
> **Then** they are sent to sign in; no message is processed and nothing is counted
>
> — `spec.md §5, AC-36, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Owner-scoped card + invoice read for the preview (reuse `getInvoice` serialization) — `lib/services/assistant-drafts/cards.ts`
- [ ] Both actions with zod input, `ActingFreelancer`, span, revalidation; never touch the allowance — `lib/actions/assistant-actions.ts`
- [ ] Integration: AVAILABLE with version (AC-20); UNAVAILABLE after delete (AC-21); foreign vs unknown id → identical NOT_FOUND (AC-22); issue success shape (AC-23); 30 of 30 used → preview + issue work, count stays 30 (AC-27); no session → UNAUTHORIZED, nothing read (AC-36); negative/non-integer version → VALIDATION — `tests/integration/ai-chat-v2-preview-actions.test.ts`
- [ ] Contract: result shapes vs server-actions.md — `tests/contract/ai-chat-v2-preview-actions.contract.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Card not `CREATED` (live, replaced) | `NOT_FOUND`, same words |
| Card of another Conversation of the same Freelancer | Allowed only via the owner check; preview address of another Freelancer → `NOT_FOUND` |
| `expectedVersion` = -1 or 1.5 | `VALIDATION`, nothing read |

## Definition of Done

- [ ] loadInvoicePreview returns AVAILABLE with the owner-scoped serialized invoice, version and state for a created card, UNAVAILABLE for a card whose invoice was deleted, and the same NOT_FOUND words for a foreign, unknown or uncreated card, issueFromPreview validates its input and maps every service outcome per the contract, neither touches the allowance, and both refuse a request without a session.
- [ ] integration + contract tests green
- [ ] span metadata only
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
