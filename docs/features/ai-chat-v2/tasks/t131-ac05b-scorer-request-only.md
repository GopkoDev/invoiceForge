# T131 — AC-05b scorer accepts only a real request; tests and instruction aligned with the owner decision

- **Layer:** backend + eval
- **Deps:** T130
- **AC:** AC-05b, AC-37
- **Source:** [review of T130](../_review/review-2026-10-16-t125-t126.md)

## Definition of done

Review of T130 (_review/review-2026-10-16-t125-t126.md, last section), findings 1-5. (1) evals/assistant/score.ts: English request regex /(?:^|[.!?:;]\s*|\n\s*|\bplease\s+|\bcan you\s+|\bcould you\s+)(choose|pick|select|name|tell me)\b[^.!?\n]*\bcustomer/im; Ukrainian uses [^.!?\n]* instead of [^.]*. (2) Unit tests: 'You named Consulting FOP as the customer, but Consulting FOP is your own sender profile.' and 'Consulting FOP is the name of your own sender profile, not a customer.' fail with 'reply does not ask for the Customer'; 'Please pick the Customer below.', 'Choose the Customer to invoice in the form.', 'Tell me which customer to bill.' pass. (3) Move the three-part doc comment back above ownProfileFailures; type the map Record<EvalLang, RegExp>. (4) tests/integration/ai-chat-v2-own-profile.test.ts: rename the two-profile test to an exact-only case ('"fop" alone sets no hint (exact only)') and make the 'Acme' test unconditional (expect PROPOSAL and the Customer id) or drop it; fix the comment. (5) lib/ai/instructions/chat.ts ~31: 'then explain that it is their own sender profile and ask which Customer to invoice: when a form is shown, ask them to choose the Customer in it; otherwise ask in one sentence that ends with a question mark.' Update tests/unit/lib/ai/chat-instructions-haiku-rules.test.ts for the new wording (keep it pinned).
