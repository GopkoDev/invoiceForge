---
id: T16
title: "Guard updateInvoiceStatus with an optional expectedVersion and set issuedFromChat on that path"
layer: "infra"
deps: ["T02", "T04"]
blocks: ["T17"]
acs: ["AC-25", "AC-26", "AC-26b"]
files_hint: ["lib/services/invoices/invoices.ts", "tests/integration/ai-chat-v2-issue-status.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T16 — Guard updateInvoiceStatus with an optional expectedVersion and set issuedFromChat on that path

## Place in the sequence

- **Blocked by:** T02 — Promote staged migrations 01–05, apply the Prisma schema edits and extend the test factories, T04 — Add the offer, origin and start-point types and the CHOICE_UNAVAILABLE and ALREADY_ISSUED error details
- **Blocks:** T17 — Add the loadInvoicePreview and issueFromPreview server actions
- **Wave:** 2 (longest dependency chain); linear position T16 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to issue a draft from its preview after one confirmation, under the editor's rules
> **So that** checking and issuing an Assistant draft is one short step where I created it
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

It makes issuing from the chat run the editor's exact issuing rules while refusing a preview that is outdated or already issued.

## Inlined context

> - Without `opts` (every existing caller, e.g. the list's row menu): unchanged.
> - With `expectedVersion`, under the existing row lock and before `decideStatusChange`: not `DRAFT` → `CONFLICT` + `ALREADY_ISSUED`; `version` differs → `CONFLICT` + `CHANGED_ELSEWHERE { currentVersion }`; then the existing decision, draft rules and bounds.
> - `issuedFromChat` is written only by `issueFromPreview`'s call (an internal flag on the same update; not a public parameter). It is never cleared; `duplicateInvoice` never copies it; `updateInvoice` never writes it.
>
> — `contracts/server-actions.md §Invoices, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Chosen:** Option 1. It runs the same lifecycle decision and draft rules the list and editor share, keeps the number (no number allocation on a status change), and closes the outdated-view race inside the same lock.
>
> — `adr/0007 §Decision outcome, abridged` · full text: [adr/0007](../adr/0007-issue-from-the-preview-through-the-invoice-status-service-guarded-by-the-version-the-preview-showed.md)

> `updateInvoiceStatus` gains an optional `expectedVersion`; other callers (row menu) keep the unchecked path | Low | Optional parameter, default unchanged. … Integration tests cover both callers.
>
> — `sad.md §11, risk row, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Change |
|---|---|
| `Invoice.version` | read-only compare under the lock (existing) |
| `Invoice.issuedFromChat` | set `true` once in the issuing write (from T02) |
| `Invoice.issuedAt`, `status` | existing issuing write, number kept |

— `data-model.md §Invoice, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `updateInvoiceStatus(actor, id, status, opts?: { expectedVersion?: number })` → `CONFLICT` + `ALREADY_ISSUED { invoice }` | `CONFLICT` + `CHANGED_ELSEWHERE { currentVersion }` | `VALIDATION` (editor's message) | `ok`.

— `contracts/server-actions.md §Invoices, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

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

## Checklist

- [ ] Add `opts.expectedVersion` checks after the lock, before `decideStatusChange`; internal `issuedFromChat` flag on the same update — `lib/services/invoices/invoices.ts`
- [ ] Ensure `duplicateInvoice` and `updateInvoice` never copy/write `issuedFromChat` — same file
- [ ] Integration: current draft issues, number kept, `issuedAt` once, version +1, flag set (AC-23 service part); issued elsewhere → ALREADY_ISSUED (AC-26); line change and note-only change → CHANGED_ELSEWHERE (AC-26b); mismatched-currency draft → editor's message verbatim, still draft (AC-25); every invoice-integrity draft-rule fixture gives the editor's outcome; two concurrent confirms → one issues; row-menu caller unchanged — `tests/integration/ai-chat-v2-issue-status.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| No `opts` | Unchanged behaviour |
| Duplicate of an invoice issued from the chat | Copy has `issuedFromChat = false` |
| Deleted since the preview loaded | `NOT_FOUND` |

## Definition of Done

- [ ] updateInvoiceStatus with expectedVersion returns CONFLICT ALREADY_ISSUED for a non-draft and CONFLICT CHANGED_ELSEWHERE for any version change under the row lock before the draft rules, keeps the editor's VALIDATION messages verbatim for rule failures, writes issuedFromChat only on the chat call, leaves the row-menu caller unchanged, and two concurrent confirms issue exactly once.
- [ ] integration tests green incl. the concurrency case
- [ ] existing invoice status tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
