---
id: T32
title: "Product candidates follow the drafting currency when only the Customer fails (review R14-1)"
layer: "app"
deps: ["T08", "T12"]
blocks: []
acs: ["AC-12b", "AC-13"]
files_hint: ["lib/services/assistant-drafts/resolve-parties.ts", "lib/services/assistant-drafts/resolve.ts", "lib/services/assistant-drafts/offers.ts", "tests/integration/ai-chat-v2-resolver-delta.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T32 — Product candidates follow the drafting currency when only the Customer fails

Follow-up task from review 2026-10-13, round 14 (R14-1). Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

When the Customer is not saved yet and the request names no currency, `resolveParties` returns only its issues. It drops the currency that `resolveSenderAndAccount` had already chosen (resolve-parties.ts:321-323). So `resolveLines` gets no currency and offers products in every currency. The R13-2 press check then refuses every product that is not in the drafting currency with 409 "no longer available".

Example: "invoice Globex for 3 hours of consulting", where Globex is not saved and "Consulting" exists in USD and in EUR. The reply offers both, and pressing EUR is always refused.

## Definition of Done

- RED first: an integration test in `ai-chat-v2-resolver-delta.test.ts` with CUSTOMER_NOT_FOUND, no currency, a USD default account, and "Consulting" in USD and EUR expects no EUR candidate and no PRODUCT_AMBIGUOUS.
- When only the Customer fails, `resolveParties` reports the drafting currency alongside its issues, and `resolveDraftRequest` passes it to `resolveLines`. The written currency stays the fallback.
- The press check (`offers.ts`) and the resolver agree on the drafting currency. Use one source where practical.
- Gate: unit, integration, lint and typecheck green; commit with `SDD-Task: T32` and the AC trailers.
