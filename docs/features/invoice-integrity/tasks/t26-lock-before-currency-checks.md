---
id: "T26"
title: "Lock the sender profile (and share-lock line products) before the currency checks on every invoice save"
layer: "app"
deps: ["T23", "T25"]
blocks: ["T28"]
acs: ["AC-11", "AC-12", "AC-13", "AC-13b"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/services/invoices/helpers.ts", "tests/integration/services/invoices/currency-lock-race.test.ts"]
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

# T26 — Lock the sender profile (and share-lock line products) before the currency checks on every invoice save

## Place in the sequence

- **Blocked by:** T23 — Apply the amount bounds by status and path: shape only on issued saves, every bound on draft saves and on issuing from the list, discount capped at the column limit, T25 — Validate the product price strictly and store the validated value; count product usage owner-scoped inside a transaction under the product row lock · **Blocks:** T28 · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review finding F7 (TOCTOU): the currency checks read the account/products before taking the lock that serializes them with currency changes.

## Inlined context

> `updateBankAccount` counts the invoices that use an account while holding the SenderProfile row lock (`bank-accounts.ts:153-170`). `createInvoice` runs `checkDraftRules` outside its transaction (`invoices.ts:412`), before `resolveManualOrAllocatedNumber` takes that lock; `duplicateInvoice` likewise (`:1054`). The draft branch of `updateInvoice` runs `checkDraftRules(…, tx)` at `:725` before `lockSenderProfileRow` (`:765`), and the `numberUnchanged` branch never takes it. A save can read the account as USD, a concurrent edit counts 0 invoices and switches it to EUR, both commit. After T25, `updateProduct` locks the product row FOR UPDATE; the invoice side must read line products `FOR SHARE` inside the save transaction for the product lock to mean anything.
>
> — `_review/review-2026-10-08.md F7, abridged`; sad §6 flow 3: "begin, read the … bank account … of this owner" inside the transaction.

Lock order must stay deadlock-free and consistent with ADR-0002/ADR-0005: invoice row (where applicable) → sender profile → products. Check existing lock order in `invoices.ts` and keep one global order.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-11, AC-12, AC-13, AC-13b. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] create/duplicate: move `checkDraftRules` into the transaction after `lockSenderProfileRow(tx, …)`; pass `tx`.
- [ ] updateInvoice draft branch: take the sender profile lock before `checkDraftRules` on every branch.
- [ ] `verifyInvoiceRelations` (inside a save tx): read line products with `FOR SHARE`.
- [ ] Race test per DoD (real container; use separate connections; deterministic interleaving via held lock where possible).

## Edge cases

| Case | Behaviour |
|---|---|
| sender profile switched on a draft | lock the target profile (the one being saved to) |
| issued invoice save | no currency check; unchanged |

## Definition of Done

- [ ] An integration race test shows that a bank-account currency change committed while createInvoice / duplicateInvoice / a draft updateInvoice is in flight can never leave an invoice whose currency differs from its bank account (repeat ≥20 runs, 0 mismatches), and likewise for a product currency change vs a draft save with that product; createInvoice and duplicateInvoice run checkDraftRules inside their transaction after lockSenderProfileRow; the draft branch of updateInvoice takes the sender profile lock before checkDraftRules on every branch including numberUnchanged.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
