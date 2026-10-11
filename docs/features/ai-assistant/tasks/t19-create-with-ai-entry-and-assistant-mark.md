---
id: T19
title: "Add \"Create with AI\" to the invoice list header and the AssistantMark to draft rows and the editor header"
layer: "ui"
deps: ["T06"]
blocks: ["T35"]
acs: ["AC-23", "AC-33"]
files_hint: ["app/(protected)/invoices/layout.tsx", "components/invoices/invoices-data-table.tsx", "components/invoice-editor/invoice-editor-header.tsx", "components/ai/assistant-mark.tsx", "docs/design-system.md", "tests/component/assistant-mark.test.tsx", "tests/component/invoices-header-create-with-ai.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T19 — Add "Create with AI" to the invoice list header and the AssistantMark to draft rows and the editor header

## Place in the sequence

- **Blocked by:** T06 — Write the Assistant origin once at creation, set issuedAt when an invoice first leaves DRAFT, and expose assistantMark on invoice reads · **Blocks:** T35 — Add Playwright flows: open the AI section, draft and create from a card, Create with AI, and the Assistant mark · **Wave:** 3 — needs only assistantMark from the invoice reads.
- **Lane:** shares `docs/design-system.md` with T22, T23, T28 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to see which drafts an Assistant created and by which Assistant, and to review and issue them myself
> **So that** I check AI work before it reaches a Customer
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a "Create with AI" entry next to "New invoice"
> **So that** I find AI drafting exactly where I create invoices, even if I never open the AI section
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task puts AI drafting where invoices are created and shows the Freelancer which drafts an Assistant made, until they issue them.

## Inlined context

**SCR-05 — Invoice list (existing).** Changed: "Create with AI" in the header and the Assistant mark on draft rows.

| State | Trigger / condition | Components |
|---|---|---|
| default | `ContentAreaHeader` `rightContent` gains an outline "Create with AI" link (sparkles icon) before "New Invoice", to `/ai?start=draft` (AC-33). The allowance is checked on arrival at SCR-01, so the button is always shown (AC-34) | `ContentAreaHeader`, `buttonVariants` |
| Assistant draft | A row whose `assistantMark` is non-null (only while the stored status is `DRAFT`): `AssistantMark` next to the status badge — "AI" with the tooltip "Created by the in-app chat" or "Created by {keyName}", the key name as it was at creation (AC-23; flow 11). Renaming or revoking the key changes nothing | `NEW: AssistantMark`, `InvoiceStatusBadge` |
| issued or hand-made | `assistantMark = null`: the row is exactly as today; an issued Assistant draft shows no mark (AC-23) | `InvoicesDataTable` |
| empty | No invoices: `InvoicesEmptyState` (unchanged); "Create with AI" stays in the header | `InvoicesEmptyState` |

**SCR-06 — Invoice editor (existing).** `Assistant draft`: `getInvoiceEditorData` → `assistantMark` non-null: `AssistantMark` beside the header status `Badge`, with the same tooltip as SCR-05 (AC-23). The editor otherwise behaves as for any draft. `issued`: no mark; the issued details, the PDF and the email say nothing about AI.

> | `AssistantMark` | … `InvoiceStatusBadge` is bound to the invoice status enum and must not carry origin. Contract: props `mark: { origin: 'CHAT' } \| { origin: 'PERSONAL_KEY'; keyName: string }`; a small outline `Badge` "AI" with a `Tooltip` "Created by the in-app chat" / "Created by {keyName}"; renders nothing for `null` | pending |
>
> — `screens.md §SCR-05, §SCR-06, §New components, abridged` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) · [server-actions.md](../contracts/server-actions.md) §Invoices) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `assistantMark: { origin: 'CHAT' } | { origin: 'PERSONAL_KEY'; keyName: string } | null` from the invoice list rows and `getInvoiceEditorData` (T06). Non-null only while the stored status is `DRAFT`.

— `contracts/server-actions.md §Invoices, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-23 — happy path

> **Given** an Assistant draft created in the chat and another created by an external Assistant through a Personal key named "Claude Desktop"
> **When** the Freelancer opens their invoice list or either draft
> **Then** each is marked as created by an Assistant, naming the in-app chat or the key's name as it was when the draft was created. Renaming or revoking the key later does not change the mark. They can edit, issue or delete it like any draft. Once issued, the visible mark is gone and the invoice the Customer receives says nothing about AI. The record of which Assistant created it is kept with the invoice for the success measure until the invoice or the account is deleted.
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

### AC-33 — happy path

> **Given** a Freelancer on their invoice list
> **When** they choose "Create with AI" next to "New invoice"
> **Then** a new Conversation opens in the AI section, ready to draft, with an example request to start from
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `AssistantMark` component (outline `Badge` + `Tooltip`, null → nothing) — `components/ai/assistant-mark.tsx`
- [ ] "Create with AI" outline link before "New Invoice" — `app/(protected)/invoices/layout.tsx`
- [ ] Mark next to the status badge in rows — `components/invoices/invoices-data-table.tsx`
- [ ] Mark in the editor header — `components/invoice-editor/invoice-editor-header.tsx`
- [ ] Register `AssistantMark` in the design canon — `docs/design-system.md`
- [ ] Component tests — `tests/component/assistant-mark.test.tsx`, `tests/component/invoices-header-create-with-ai.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| `assistantMark = null` | nothing rendered, layout unchanged |
| Key renamed after creation | tooltip keeps the creation-time name |
| Phone width | header buttons wrap under the title; mark stays beside the badge |
| Allowance used up | "Create with AI" still shown; SCR-01 handles it (AC-34) |

## Definition of Done

- [ ] Component tests show the invoice list header links "Create with AI" to /ai?start=draft before "New Invoice", a draft row and the editor header show the AI mark with "Created by the in-app chat" or "Created by {keyName}", and an issued or hand-made invoice shows no mark.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
