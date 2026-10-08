---
id: "T33"
title: "Cover the bank account dialog's make-default guard: one switch per double click, a failed switch keeps the dialog open"
layer: "tests"
deps: []
blocks: []
acs: ["AC-17"]
files_hint: ["tests/component/default-and-currency-lock-forms.test.tsx", "components/modals/sender-profile/bank-account-modal.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
source: "review-2026-10-08-r2"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T33 — Cover the bank account dialog's make-default guard: one switch per double click, a failed switch keeps the dialog open

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08-r2.md`](../_review/review-2026-10-08-r2.md).

## Why

Review finding N1.

## Inlined context

> N1: T31 added an in-flight guard to `BankAccountModal` (`bank-account-modal.tsx:86-96`) but `default-and-currency-lock-forms.test.tsx:303-335` exercises only `SenderProfileForm`. test-plan.md:85 AC-17 row: "the same holds for bank accounts within one sender profile".
>
> — `_review/review-2026-10-08-r2.md N1, abridged`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08-r2.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-17.

## Checklist

- [ ] Add the two BankAccountModal tests next to the SenderProfileForm pair.
- [ ] Prove the first test is a real guard: temporarily remove `inFlight` and see it go red (do not commit that).

## Edge cases

| Case | Behaviour |
|---|---|
| CONFLICT reply | dialog stays open, toast shows the race message, one call |

## Definition of Done

- [ ] Component tests for BankAccountModal mirror the SenderProfileForm AC-17 pair: a double submit with "Set as default" ticked sends exactly one updateBankAccount; a CONFLICT reply keeps the dialog open, toasts the race message and sends no second call. Removing the in-flight guard turns the first test red.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] lint + vet clean
