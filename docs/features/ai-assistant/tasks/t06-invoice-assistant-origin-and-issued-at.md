---
id: T06
title: "Write the Assistant origin once at creation, set issuedAt when an invoice first leaves DRAFT, and expose assistantMark on invoice reads"
layer: "app"
deps: ["T01"]
blocks: ["T19", "T20", "T21"]
acs: ["AC-23"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/services/invoices/select-queries.ts", "lib/services/invoices/editor-data.ts", "types/invoice/types.ts", "tests/integration/services/invoices/assistant-origin.test.ts", "tests/integration/services/invoices/issued-at.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T06 — Write the Assistant origin once at creation, set issuedAt when an invoice first leaves DRAFT, and expose assistantMark on invoice reads

## Place in the sequence

- **Blocked by:** T01 — Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables · **Blocks:** T19 — Add "Create with AI" to the invoice list header and the AssistantMark to draft rows and the editor header, T20 — Store Draft cards with one live card per Conversation and create the Draft invoice only from the Create press, T21 — Create a Draft invoice for a Personal key: permission, repeat mark, resolver, key slot, invoice and repeat row in one transaction · **Wave:** 2 — the invoice side both create paths (chat card, MCP key) and the mark UI need.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to see which drafts an Assistant created and by which Assistant, and to review and issue them myself
> **So that** I check AI work before it reaches a Customer
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task makes the origin of every Assistant draft a write-once fact on the invoice, visible only while it is a draft, and starts recording when invoices are first issued for the north-star KPI.

## Inlined context

> **The Assistant origin sits on the invoice** (ADR-0013). `assistantOrigin` (`CHAT` | `PERSONAL_KEY`), `assistantKeyName` (the name at creation) and `assistantKeyId` (set to null if the key row is deleted) are written once at creation and never changed.
> - The mark is rendered only while the invoice is a draft.
> - Issued details and the PDF never read these columns, and `duplicateInvoice` never copies them.
> - `Invoice.issuedAt` is written once, when an invoice first leaves draft, so the north-star KPI can measure "issued within 14 days". The schema records no such time today.
>
> — `sad.md §5, building-block decisions, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** **Brownfield: `createInvoice(actor, InvoiceFormInput)`** is the editor's input shape. The Assistant origin must be added without leaking into the editor form or `duplicateInvoice` (ADR-0013). — The resolver emits `InvoiceFormInput`; origin is passed as a separate service argument; unit tests assert that duplicate and editor saves never copy or overwrite it.
>
> — `sad.md §11, risk row 10, abridged` · full text: [sad.md](../sad.md)

> **Write rules (app-side, no DB form, as in the repo):**
> - The three origin columns are set only by `createFromCard` (chat) and `createForKey` (MCP). `updateInvoice` and the editor save never write them, and `duplicateInvoice` never copies them (ADR-0013 Negative; a unit test guards both).
> - `issuedAt` is set with `"issuedAt" = $now WHERE "issuedAt" IS NULL` on every path that moves an invoice out of `DRAFT`. In `lib/services/invoices/invoices.ts` those paths are `createInvoice` with a non-draft status, `updateInvoice` with a status change, and `updateInvoiceStatus`. Nothing clears it (an issued invoice never returns to draft).
> - **No backfill.** Existing invoices keep NULL.
>
> — `data-model.md §Invoice, write rules, abridged` · full text: [data-model.md](../data-model.md)

Current signatures (code): `createInvoice(actor, data: InvoiceFormInput)` (`invoices.ts:424`), `updateInvoice(actor, id, data)` (`:669`), `updateInvoiceStatus(actor, id, status)` (`:1008`), `duplicateInvoice(actor, id)` (`:1090`).

**Fallback:** insufficient or contradicted by the code → read the named file in full ([data-model.md](../data-model.md) · [server-actions.md](../contracts/server-actions.md) · [ADR-0013](../adr/0013-record-the-assistant-origin-as-write-once-columns-on-the-invoice.md)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `assistantOrigin` | `AssistantOrigin` (`CHAT` / `PERSONAL_KEY`) | NULL = made by hand | written once at creation (this task adds the writer) |
| `assistantKeyName` | TEXT | NULL | the key's `name` at creation, `PERSONAL_KEY` only |
| `assistantKeyId` | TEXT | NULL, FK → `PersonalKey(id)` ON DELETE SET NULL | `PERSONAL_KEY` only |
| `issuedAt` | TIMESTAMP(3) | NULL | set once when the invoice first leaves `DRAFT` |

— `data-model.md §Invoice (four new columns), abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `createInvoice(actor, data, origin?: { origin: 'CHAT' } | { origin: 'PERSONAL_KEY'; keyId: string; keyName: string }, tx?)` — the origin is a separate argument, never a field of `InvoiceFormInput`; accepts an outer transaction client so T20/T21 can create inside their own transaction.
- Every invoice read DTO (list rows, recent invoices, `getInvoice`, `getInvoiceEditorData`) gains:
  ```ts
  assistantMark: { origin: 'CHAT' } | { origin: 'PERSONAL_KEY'; keyName: string } | null;
  ```
  The value is non-null only while the stored status is `DRAFT`. `keyName` is `assistantKeyName`, the name at creation. Issued details, the PDF and the email never carry it.
- `createInvoice` / `updateInvoice` / `updateInvoiceStatus` set `issuedAt = now` where it is null, when the invoice leaves `DRAFT`. The signatures are unchanged.

— `contracts/server-actions.md §Invoices, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-23 — happy path

> **Given** an Assistant draft created in the chat and another created by an external Assistant through a Personal key named "Claude Desktop"
> **When** the Freelancer opens their invoice list or either draft
> **Then** each is marked as created by an Assistant, naming the in-app chat or the key's name as it was when the draft was created. Renaming or revoking the key later does not change the mark. They can edit, issue or delete it like any draft. Once issued, the visible mark is gone and the invoice the Customer receives says nothing about AI. The record of which Assistant created it is kept with the invoice for the success measure until the invoice or the account is deleted.
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Optional `origin` argument and `tx` passthrough on `createInvoice`; write the three columns only from it — `lib/services/invoices/invoices.ts`
- [ ] `issuedAt` set-once on the three leave-DRAFT paths (`WHERE "issuedAt" IS NULL` semantics) — `lib/services/invoices/invoices.ts`
- [ ] `duplicateInvoice` and `updateInvoice` never select-and-copy or accept origin columns — `lib/services/invoices/invoices.ts`
- [ ] Select the origin columns and map `assistantMark` (DRAFT only) in list, recent, `getInvoice` and editor reads — `lib/services/invoices/select-queries.ts`, `lib/services/invoices/editor-data.ts`, `types/invoice/types.ts`
- [ ] Integration tests — `tests/integration/services/invoices/assistant-origin.test.ts`, `tests/integration/services/invoices/issued-at.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Draft with origin issued, then a revert to draft is attempted | refused by the lifecycle (an issued invoice never returns to draft); mark stays hidden; origin and `issuedAt` kept |
| Invoice created already non-draft | `issuedAt` = creation time |
| Duplicate of an Assistant draft | copy has no origin, `issuedAt` NULL |
| Key renamed or revoked after creation | `assistantKeyName` unchanged |
| Key row deleted (account deletion) | `assistantKeyId` NULL, name kept |
| Issued details / PDF / email | never read the origin columns |

## Definition of Done

- [ ] Integration tests show createInvoice stores the origin columns only when passed the separate origin argument, updateInvoice/the editor save and duplicateInvoice never write or copy them, issuedAt is set once on every path out of DRAFT and never cleared, and every invoice read DTO returns assistantMark only while the stored status is DRAFT.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
