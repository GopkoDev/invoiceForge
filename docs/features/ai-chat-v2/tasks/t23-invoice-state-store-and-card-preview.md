---
id: T23
title: "Add the workspace invoice-state store and the Draft card Preview button"
layer: "ui"
deps: ["T17", "T22"]
blocks: ["T24"]
acs: ["AC-21", "AC-23"]
files_hint: ["components/ai/invoice-state-context.tsx", "components/ai/draft-card.tsx", "components/ai/chat-link.tsx", "components/ai/chat-island.tsx", "docs/design-system.md", "tests/component/invoice-state-store.test.tsx", "tests/component/chat-link.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T23 — Add the workspace invoice-state store and the Draft card Preview button

## Place in the sequence

- **Blocked by:** T17 — Add the loadInvoicePreview and issueFromPreview server actions, T22 — Render Offered choices under a reply and send a press from the chat island
- **Blocks:** T24 — Build the invoice preview panel and the issue confirmation for desktop and phone
- **Wave:** 10 (longest dependency chain); linear position T23 of T31 for the sequential in-place run.
- **Lane:** shares `docs/design-system.md` with T19; `components/ai/chat-island.tsx` with T20; `components/ai/chat-island.tsx` with T21; `components/ai/chat-island.tsx` with T22; `components/ai/chat-island.tsx` with T24; `components/ai/chat-island.tsx` with T26 — serialized in id order.

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

It makes the card and every link to an invoice show the same live status right after the Freelancer's own action.

## Inlined context

> **Chosen:** Option 1. Every place that learns a new state (a load or an action result) writes it once, every place that shows it reads it, and nothing navigates or polls.
>
> — `adr/0008 §Decision outcome, verbatim` · full text: [adr/0008](../adr/0008-keep-invoice-states-in-one-workspace-store-fed-by-loads-and-action-results-without-push.md)

> Contract: `useInvoiceState(invoiceId)` → `LinkedInvoiceState | undefined`; `apply(invoiceId, state)` from loads, `createDraftFromCard`, `loadInvoicePreview` and `issueFromPreview` results
>
> — `screens.md §New components, InvoiceStateProvider, verbatim` · full text: [screens.md](../screens.md)

> - Once the card is created, it gets a **"Preview"** `Button` (outline, eye icon) beside the editor link. Preview pushes `?preview={cardId}` (ADR-0005).
> | created (draft) | Store state `DRAFT` (AC-20). "Draft {number} created." with `ChatLink` "Open in editor →" … and "Preview" |
> | created, issued | Store state issued … "Invoice {number}" with `InvoiceStatusBadge`. … The Assistant mark shows nowhere in the card |
> | created, no longer available | Store state `UNAVAILABLE` … "This draft is no longer available." No link and no Preview |
>
> — `screens.md §SCR-05, abridged` · full text: [screens.md](../screens.md)

> **Live invoice status** covers the draft card and its system-made links (Preview, "Open in editor"), as in ai-assistant AC-36. Invoice names in reply text written by the model are not updated.
>
> — `spec.md §1, interview decisions, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Consumes `createDraftFromCard` (existing), `loadInvoicePreview`, `issueFromPreview` results (T17) as `LinkedInvoiceState` updates.

— `contracts/server-actions.md §Assistant actions, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-21 — error

> **Given** a draft created in the chat and since deleted in the editor
> **When** the Freelancer presses Preview on its card
> **Then** the panel says the invoice is no longer available and offers no Issue button, and the card shows the same
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — happy path

> **Given** an open preview of an Assistant draft for Acme Corp of 1,000.00 USD
> **When** the Freelancer presses Issue and confirms in the dialog that names the Customer, the total and the currency and says that its lines and amounts can no longer change once issued
> **Then** the invoice is issued through the same path as issuing from the editor and keeps the invoice number it got when it was created; the preview, the card and every link to it in the Conversation show it as issued, and the Assistant-draft mark disappears as for any issued Assistant draft
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `InvoiceStateProvider` + `useInvoiceState` + `apply` — `components/ai/invoice-state-context.tsx`
- [ ] Seed from the page load inside the island; `DraftCard` created states read the store, add Preview (pushes `?preview={cardId}`), rename "Open draft →" to "Open in editor →" — `components/ai/chat-island.tsx`, `draft-card.tsx`
- [ ] `ChatLink` reads the store when no explicit state — `components/ai/chat-link.tsx`
- [ ] Register `InvoiceStateProvider`; update `DraftCard` / `ChatLink` contracts — `docs/design-system.md`
- [ ] Component tests: apply ISSUED → card + link show issued (AC-23); apply UNAVAILABLE → card "no longer available", no Preview (AC-21) — `tests/component/`

## Edge cases

| Case | Behaviour |
|---|---|
| Invoice issued in another tab | Shows on the next preview load, issue attempt or reopen (accepted debt, no push) |
| Model-written invoice name in text | Not updated |
| At zero allowance | Create and Preview work |

## Definition of Done

- [ ] One InvoiceStateProvider seeded from the page load is applied by createDraftFromCard, loadInvoicePreview and issueFromPreview results, the created Draft card shows Preview and "Open in editor" and reads its status from the store, ChatLink reads the same store, and a component test shows the card, links and panel agree after an issue or an unavailable result.
- [ ] component tests green
- [ ] design-system inventory updated
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
