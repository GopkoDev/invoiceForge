---
id: "T22"
title: "Refresh the issued details in the editor after Save and issue and never offer a picker on an issued invoice"
layer: "ui"
deps: []
blocks: ["T23", "T30", "T32"]
acs: ["AC-01", "AC-02", "AC-03", "AC-08"]
files_hint: ["lib/services/invoices/invoices.ts", "docs/features/invoice-integrity/contracts/server-actions.md", "store/invoice-editor-store/use-invoice-editor-store.ts", "components/invoice-editor/sender-section.tsx", "components/invoice-editor/customer-section.tsx", "tests/component/invoice-editor-modes.test.tsx", "tests/integration/services/invoices/update-draft-invoice.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T22 — Refresh the issued details in the editor after Save and issue and never offer a picker on an issued invoice

## Place in the sequence

- **Blocked by:** — · **Blocks:** T23, T30, T32 · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review finding F1 (HIGH, found independently by two reviewers): issuing from the editor leaves the editor showing and printing stale or missing issued details.

## Inlined context

> After a successful Save and issue, `applySavedInvoice` sets `storedStatus: saved.status` (PENDING), so the editor switches to issued mode in place, but `issuedDetails` keeps the value from `initialize` (set once on mount) — the server has just refreshed the issued details from the current records and frozen them (`lib/services/invoices/invoices.ts:851-853`). The "To" block (`customer-section.tsx:45`) and the editor's Download/Print (`store/invoice-editor-store/pdf-parties.ts:33`) show the old snapshot while the list's PDF prints the frozen one. For a new invoice saved (URL changes via `history.replaceState`, no reload) and then issued, `issuedDetails` is null, so `sender-section.tsx:65` / `customer-section.tsx:45` fall back to the live pickers, which are not disabled.
>
> — `_review/review-2026-10-08.md F1, abridged`

> issued | … the sender, Customer and bank account blocks show the **issued details** as text, not a picker over the current records (AC-01).
>
> — `screens.md SCR-02 issued, abridged`; SCR-02 `issued-from-editor`: "the details saved in this call are now fixed".

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-01, AC-02, AC-03, AC-08. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] `SavedInvoice` (service + `contracts/server-actions.md`) gains the issued details (same shape the editor loads as `issuedDetails`) whenever the saved row is not a draft; null for a draft.
- [ ] `applySavedInvoice` sets `issuedDetails` from the saved result.
- [ ] Locked sections never fall back to a picker while the editor is in issued or cancelled mode; if issued details are somehow absent, render the selected records as text.
- [ ] Component test (extend `tests/component/invoice-editor-modes.test.tsx:177`): draft opened with an old snapshot, Save and issue returns new frozen details → the From/To/bank text equals the returned details; PDF parties use them.
- [ ] Component test: new invoice → Save → Save and issue → no combobox/picker for sender, Customer or bank account.
- [ ] Integration assertion that `updateInvoice` returns the frozen issued details when it issues a draft.

## Edge cases

| Case | Behaviour |
|---|---|
| draft saved (stays draft) | issuedDetails stay null; pickers stay |
| issued invoice saved (notes edit) | issuedDetails returned unchanged |
| save refused | store untouched |

## Definition of Done

- [ ] A component test shows that after Save and issue the From, To and bank blocks and the editor PDF parties show the details the server froze (not the snapshot the editor opened with), and that a new invoice saved and then issued in the same editor session renders those blocks as text with no sender, Customer or bank picker; SavedInvoice carries the issued details for an issued result and the contract documents it.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
