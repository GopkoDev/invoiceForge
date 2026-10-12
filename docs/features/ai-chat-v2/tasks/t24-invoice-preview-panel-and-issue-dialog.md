---
id: T24
title: "Build the invoice preview panel and the issue confirmation for desktop and phone"
layer: "ui"
deps: ["T23"]
blocks: ["T31"]
acs: ["AC-19", "AC-20", "AC-21", "AC-22", "AC-23", "AC-25", "AC-26", "AC-26b", "AC-27"]
files_hint: ["components/ai/invoice-preview-panel.tsx", "components/ai/issue-confirmation.tsx", "components/ai/ai-workspace.tsx", "components/ai/chat-island.tsx", "docs/design-system.md", "tests/component/invoice-preview-panel.test.tsx", "tests/component/issue-confirmation.test.tsx"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T24 — Build the invoice preview panel and the issue confirmation for desktop and phone

## Place in the sequence

- **Blocked by:** T23 — Add the workspace invoice-state store and the Draft card Preview button
- **Blocks:** T31 — Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility
- **Wave:** 11 (longest dependency chain); linear position T24 of T31 for the sequential in-place run.
- **Lane:** shares `components/ai/ai-workspace.tsx` with T19; `components/ai/chat-island.tsx` with T20; `components/ai/chat-island.tsx` with T21; `components/ai/chat-island.tsx` with T22; `components/ai/chat-island.tsx` with T23; `components/ai/chat-island.tsx` with T26 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the Conversation list and the invoice preview to open as their own screens or sheets on a phone
> **So that** the chat has the whole screen when I type
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

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

It lets the Freelancer check exactly what the Customer would receive and issue it from the chat under the editor's rules.

## Inlined context

> `NEW: InvoicePreviewPanel` … opens from `?preview={cardId}` and calls `loadInvoicePreview(cardId)` (ADR-0006) on open, on a reload with the parameter, and after `CHANGED_ELSEWHERE`. At `≥ md` it is a grid column (not a modal) … At `< md` it renders inside a `Sheet` (`side="bottom"`, `h-dvh`, full width). Back closes it (pushState), and so do `×` and Escape. … body: `PDFPreviewPanel` with `source = { kind: 'issued', invoice }` … footer, always visible: "Open in editor" … and, only while the invoice is a draft, "Issue invoice" (primary). … The panel moves focus to its heading on open and returns focus to the card's Preview button on close.
>
> — `screens.md §SCR-06, abridged` · full text: [screens.md](../screens.md)

> States: loading · draft · issued · issuing · issued now (`toast.success` "Invoice {number} issued.") · already issued (info `Alert` "This invoice has already been issued.") · reloaded (outdated) (warning `Alert` "This draft was changed after you opened the preview. Check it and issue again.") · blocked (destructive `Alert` "Can't issue this invoice" + the editor's message verbatim + `fieldErrors`; "Open in editor" becomes primary) · issue failed (`toast.error` "The invoice couldn't be issued. Try again.") · no longer available (`Empty` "This invoice is no longer available.") · not found (`Empty` "This invoice can't be found.") · load failed ("The preview couldn't be loaded. Try again." + Try again) · md–xl layout (list hidden, "Show conversations" toggle).
>
> — `screens.md §SCR-06, states, abridged` · full text: [screens.md](../screens.md)

> Title "Issue invoice {number}?". The body names, from the preview the panel shows (the loaded `invoice`, never a cached card): … Confirm is "Issue invoice" and Cancel is "Cancel". `onConfirm` returns the `issueFromPreview(invoiceId, version)` promise. The modal locks both buttons while it is pending and never closes itself. The caller closes it once the promise settles, for every outcome
>
> — `screens.md §SCR-07, abridged` · full text: [screens.md](../screens.md)

> **Chosen:** Option 1. It survives a reload and a shared link, makes Back close the phone sheet, and keeps everything inside the mounted island with no route segment change, so the remount bug cannot come back.
>
> — `adr/0005 §Decision outcome, abridged` · full text: [adr/0005](../adr/0005-give-a-saved-conversation-and-an-open-preview-their-own-addresses-and-keep-a-new-conversation-at-ai.md)

> Preview open, p95 | ≤ 1.5 s from the press to a rendered preview | e2e timing + web vitals
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `loadInvoicePreview(cardId)`, `issueFromPreview(invoiceId, version)` (T17), with every result routed to a panel state and `apply`d to the store (T23).

— `contracts/server-actions.md §loadInvoicePreview + §issueFromPreview, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-19 — happy path

> **Given** a Freelancer on a phone (a screen narrower than 768 px)
> **When** they open the AI section, switch Conversations, and open a draft's preview
> **Then** the chat fills the screen with the message box at the bottom; the Conversation list opens as its own screen or sheet and closes when they pick one; the preview opens as a full-screen sheet with the same actions as on a desktop
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

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

### AC-25 — cross-context

> **Given** an Assistant draft that breaks an invoice-integrity rule — for example a draft saved before the invoice-integrity release whose lines and bank account are in different currencies
> **When** the Freelancer presses Issue in the chat's preview and confirms
> **Then** issuing is blocked with the same explanation the editor gives, the invoice stays a draft, and the panel offers "Open in editor" to fix it. Every other invoice-integrity rule applies the same way.
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — domain invariant

> **Given** a preview opened on a draft, after which the draft was issued from the editor in another tab
> **When** the Freelancer presses Issue in the chat's preview and confirms
> **Then** nothing is issued again; the panel and the card show the invoice as already issued
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

### AC-26b — domain invariant

> **Given** a preview opened on a draft, after which the Freelancer changed that draft's lines in the editor in another tab
> **When** they press Issue in the chat's preview and confirm
> **Then** nothing is issued from the outdated view; the preview reloads with the draft as it is now, and the Freelancer must press Issue and confirm again in a dialog that names its current Customer, total and currency, so they never issue an invoice they did not see. Any saved change to the draft makes the preview outdated, not only a change of lines.
>
> — `spec.md §5, AC-26b, verbatim` · full text: [spec.md](../spec.md)

### AC-27 — domain invariant

> **Given** a Freelancer who has used their whole Daily message allowance today, with a created draft's preview open
> **When** they issue it
> **Then** the invoice is issued, because opening a preview and issuing are not messages and never count toward the allowance
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `InvoicePreviewPanel` (grid column ≥ md, bottom `Sheet` < md, focus management, all states) reusing `PDFPreviewPanel` — `components/ai/invoice-preview-panel.tsx`
- [ ] `IssueConfirmation` body for `ConfirmationModal` — `components/ai/issue-confirmation.tsx`
- [ ] Workspace: `?preview=` read/push/pop, `md`–`xl` list toggle, three panes from `xl` — `components/ai/ai-workspace.tsx`, `chat-island.tsx`
- [ ] Register `InvoicePreviewPanel` and `IssueConfirmation` — `docs/design-system.md`
- [ ] Component tests per state: draft with Open in editor + Issue (AC-20); no longer available, no Issue (AC-21); not found, no hint (AC-22); dialog names "Acme Corp", "1,000.00", "USD" + fixed sentence and issued now updates card/links (AC-23); blocked with editor message (AC-25); already issued (AC-26); reload + new confirmation with current figures (AC-26b); works with used-up allowance (AC-27); phone sheet with same actions (AC-19) — `tests/component/`

## Edge cases

| Case | Behaviour |
|---|---|
| Preview of an issued invoice | Document + "Open in editor" only |
| Reload with `?preview=` in the address | Panel reopens and loads again |
| Back on a phone | Closes the sheet, stays in the Conversation |
| Rejected action promise | `goToSignIn()` (canon behaviour) |

## Definition of Done

- [ ] ?preview={cardId} opens InvoicePreviewPanel beside the messages from 768 px and as a full-screen sheet below, it renders every SCR-06 state from loadInvoicePreview and issueFromPreview results with the contract texts verbatim, the IssueConfirmation body names Customer, total, currency and the fixed sentence from the loaded preview, an outdated result reloads and needs a new confirmation, and both components are registered in docs/design-system.md.
- [ ] component tests green for every SCR-06/SCR-07 state
- [ ] design-system inventory updated
- [ ] focus trap and return verified
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
