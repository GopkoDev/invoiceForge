---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0007 — Issue from the preview through the invoice status service, guarded by the version the preview showed

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

Issuing from the chat must follow "exactly the editor's issuing path and invoice-integrity rules" (spec §1). It keeps the invoice number (AC-23), blocks with the editor's explanation (AC-25), never issues twice (AC-26), never issues an outdated view (AC-26b: "any saved change makes the preview outdated") and never counts (AC-27). The editor issues with "Save and issue", a full form save with `loadedVersion`. The list issues with `updateInvoiceStatus`, which locks the row and runs the same draft rules and bounds (`checkDraftRules`, `amountBoundErrors`), but has no version check. Invoices carry `version` (invoice-integrity ADR-0004). SAD §4 seed 4.

## Decision drivers

- Spec §6 "Issue from the chat, p95 ≤ 2 s server-side from the confirmation".
- Spec §6.1 abuse case "Accidental issuing": an outdated preview reloads before issuing.
- One set of issuing rules for the editor, the list and the chat (invoice-integrity ADR-0002 `decideStatusChange`).

## Considered options

1. **`updateInvoiceStatus` with an optional `expectedVersion`.** Under the row lock:
   - not a draft → `ALREADY_ISSUED`;
   - version differs → `CHANGED_ELSEWHERE` (the panel reloads);
   - otherwise the existing draft rules, then issue.

   A new `issueFromPreview(invoiceId, version)` server action is the only caller that passes a version.
2. **Reuse the editor's `updateInvoice` save** with status PENDING and `loadedVersion`, sending the stored invoice back as form data.
3. **Call `updateInvoiceStatus` unchanged** and compare versions on the client before calling.

## Decision outcome

**Chosen:** Option 1. It runs the same lifecycle decision and draft rules the list and editor share, keeps the number (no number allocation on a status change), and closes the outdated-view race inside the same lock. Option 2 round-trips a whole form the panel never had, and any serialization drift becomes an edit at issue time. Option 3 leaves a window between the client check and the lock in which a save in another tab is issued unseen, which AC-26b forbids.

## Consequences

**Positive**
- The "already issued", "outdated" and "blocked" outcomes come from one locked transaction. Two concurrent confirms issue exactly once.
- The list's row menu is unchanged (it passes no version).

**Negative**
- A change in a shared service function (an optional parameter and two result details). Its integration tests must cover both callers.

**Neutral**
- `issuedAt` and the end of the Assistant-draft mark follow from the existing status path (ai-assistant ADR-0013).

## Links

- Spec: [[../spec.md]] §1 "Preview and issue from the chat", AC-23–AC-27; §6.1
- SAD: [[../sad.md]] §4, §6 flow 2, §10 QG-2
- Related ADR: [[0006-load-the-chats-invoice-preview-through-an-owner-scoped-server-action-and-the-shared-document-model]]; invoice-integrity ADR-0002, ADR-0004; ai-assistant ADR-0013
