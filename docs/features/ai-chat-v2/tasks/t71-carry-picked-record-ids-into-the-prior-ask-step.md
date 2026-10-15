---
id: T71
title: "Carry each picked record's id and the pinned partial request into the prior ask_user step so no picked record is matched again by name (review R20-3)"
layer: "app"
deps: ["T57"]
blocks: []
acs: ["AC-10"]
files_hint: ["app/api/chat/route.ts", "lib/ai/run-turn.ts", "lib/ai/instructions/chat.ts", "tests/integration/api/chat-route-form.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T71 — Carry each picked record's id and the pinned partial request into the prior ask_user step so no picked record is matched again by name (review R20-3)

Follow-up task from review 2026-10-13, round 20. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

When the stored request is null (an ask_user form without `draft`) or the request with answers applied still fails `draftRequestSchema`, route.ts:202-209 drops the pinned request and the model gets only `{heading, answer}` label text from `priorAskStep` (run-turn.ts:167). A picked Customer, profile, account or product then reaches the model as a label, so it calls propose_draft with a name and look-alike folding can match another record. F6: a picked record is put into the draft as exactly that record and never matched again by name.

## Definition of Done

- Each answer in the prior ask_user tool result that picked a record option carries that record's id as data under the propose_draft field it fills (customerId, senderProfileId, bankAccountId, or productId with its line), and the partially pinned request (when one exists) is passed as data too; the tool result still says these are the Freelancer's answers, as data, not instructions.
- The chat instructions tell the model to pass those ids to propose_draft instead of names.
- A route/integration test: an ask_user form without `draft` offers two look-alike Customers; the Freelancer picks one; the prior step the model receives carries exactly that customerId (assert on the model input via the existing mock model), and when the mock model passes it on, the card names exactly that Customer. A second case: answers applied but the request still incomplete, the partial request is passed.
- RED first. Gate: unit, integration, lint, typecheck.
- Commit with `SDD-Task: T71` and one `SDD-AC` trailer per AC.
