---
id: T70
title: "A sent form checks a picked record only for still existing, being the actor's and unchanged, not for fitting the stored request (review R20-1)"
layer: "domain"
deps: ["T56"]
blocks: []
acs: ["AC-09", "AC-12b", "AC-13"]
files_hint: ["lib/services/assistant-drafts/forms.ts", "lib/services/assistant-drafts/offers.ts", "tests/integration/services/assistant-drafts/form-check.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T70 — A sent form checks a picked record only for still existing, being the actor's and unchanged, not for fitting the stored request (review R20-1)

Follow-up task from review 2026-10-13, round 20. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

`checkForm` (forms.ts:586) calls the old press-path `stillFits` (offers.ts:195-208), which requires a bank account to sit in the stored request's sender profile (the default one when none is named) and a product to be priced in the drafting currency, checked against the stored request before this form's own answers apply. `checkAskUser` (forms.ts:441-463) offers any account of any of the Freelancer's profiles and any active product in any currency. So a form the chat just built can be refused on its first Send with the F7 sentence although nothing changed: an account of a non-default profile, a profile picked together with its own account in the same form, a product in another currency. F6: answers that do not fit together are reported by the draft action after Send and asked again in the next form, which is not a refusal under F7. SAD §5 limits "no longer fits" to a changed stored ref (an account whose currency changed, a profile removed). form-check.test.ts:434 asserts the wrong behaviour.

## Definition of Done

- For FORM rows, a picked record option passes the check when the record still exists, is the actor's, is of the asked kind and has not changed since the form was made in a way its option ref records (for example a bank account's currency stored with the ref; a product still active). Cross-answer fit (account vs profile, product vs currency) is left to the resolver after `pinAnswers`.
- The request-based `stillFits` rule stays only for legacy F9a (one-question, pressed-choice) rows.
- form-check.test.ts:434 is rewritten (not deleted) to assert that an account of another sender profile, a profile picked with its own account in the same form, and a product priced in another currency are ACCEPTED; new cases assert a deleted record, a foreign record and an account whose currency changed since the form was made are still UNAVAILABLE with the uniform F7 refusal.
- RED first (integration, testcontainers). Gate: unit (8 known env.example failures only), integration, lint, typecheck.
- Commit with `SDD-Task: T70` and one `SDD-AC` trailer per AC.
