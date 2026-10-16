# T132 — AC-05b scorer: requests in Markdown pass; a stray question does not

- **Layer:** eval
- **Deps:** T131
- **AC:** AC-05b
- **Source:** [review of T131](../_review/review-2026-10-16-t125-t126.md)

## Definition of done

Review of T131 (_review/review-2026-10-16-t125-t126.md, last section), low items 1-2. evals/assistant/score.ts: (1) English request regex allows Markdown and softer request forms between the anchor and the verb: /(?:^|[.!?:;,]\s*|\n\s*|\bplease\s+|\bcan you\s+|\bcould you\s+|\byou can\s+|\bkindly\s+)(?:[-*+]\s+|\d+\.\s+)?(?:\*\*|__)?(choose|pick|select|name|tell me)\b[^.!?\n]*\bcustomer/im (adjust if a near-miss starts passing). (2) The '?' path requires the question sentence itself to name the Customer: en /[^.!?\n]*\bcustomers?\b[^.!?\n]*\?/i, uk /[^.!?\n]*(клієнт|замовник)[^.!?\n]*\?/i. Unit tests (tests/unit/evals/assistant-eval-chat-v2.test.ts): passing '… sender profile.\n- Choose the customer in the form.', '… sender profile.\n\n**Choose the customer** in the form below.', '… Please **choose the customer** below.', '…, so choose a customer in the form.', 'You can pick the customer in the form.', 'Which Customer should this invoice be for?'; failing 'You named Consulting FOP as the customer, but it is your own sender profile. Anything else?' plus all T131 near-misses still failing.
