---
id: "T24"
title: "Pin the editor's account-driven currency: picking a bank account sets the draft currency and a catalogue line in another currency is refused on its line"
layer: "ui"
deps: []
blocks: ["T30"]
acs: ["AC-11", "AC-12"]
files_hint: ["tests/component/invoice-editor-currency.test.tsx", "store/invoice-editor-store/use-invoice-editor-store.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T24 — Pin the editor's account-driven currency: picking a bank account sets the draft currency and a catalogue line in another currency is refused on its line

## Place in the sequence

- **Blocked by:** — · **Blocks:** T30 · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review finding F4. Owner decision: the editor keeps deriving the invoice currency from the chosen bank account; AC-11 was amended (commit 13accf3) so the bank-account refusal is the server guard for legacy drafts and other paths.

## Inlined context

> **Given** a draft stored in EUR whose bank account is held in USD (a draft saved before this release, or one written by any path other than the editor's bank account picker) **When** it is saved, or moved to pending from any path **Then** the system blocks the save and explains on the bank account field that the account is in USD while the invoice is in EUR. In the editor, choosing a bank account sets the draft's currency to that account's currency, so a mismatch a Freelancer creates there shows up on the catalogue lines instead (AC-12)
>
> — `spec.md §5 AC-11 (amended), verbatim`

Code today: `selectBankAccount` / `selectSenderProfile` set `formData.currency` from the account (`use-invoice-editor-store.ts:340-342, 376-381`); the currency input is read-only with "Currency is determined by the selected bank account" (`invoice-details-section.tsx:100-111`). The existing AC-11 test (`invoice-editor-field-errors.test.tsx:135`) only mocks the server reply.

This is a **characterization/pinning** test of correct existing behaviour: a green first run is expected. Prove it is not vacuous by temporarily removing the currency sync and seeing it fail (state that in the report), then restore.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-11, AC-12. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] New component test file driving the real picker (mock only the server action).
- [ ] No production change expected; if the store needs a fix to satisfy the amended AC, make the minimal one.

## Edge cases

| Case | Behaviour |
|---|---|
| sender profile switch | currency follows the profile's default account |
| free-text line | not checked |

## Definition of Done

- [ ] A component test drives the real bank-account picker: on a EUR draft, picking a USD account shows USD as the invoice currency, and saving with a EUR catalogue line renders the AC-12 error under that line; a second test loads a legacy draft stored with mismatching currencies and shows the AC-11 bankAccountId error under the bank account select after save.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
