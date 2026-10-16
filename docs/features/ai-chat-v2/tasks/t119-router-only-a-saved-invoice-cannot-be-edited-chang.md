# T119 — Router: only a saved invoice cannot be edited; changing the chat's draft card is drafting

- **Layer:** backend
- **Deps:** T117
- **AC:** AC-14b, AC-15
- **Source:** [review T115–T118](../_review/review-2026-10-16-t115-t118.md), second Haiku evaluation

## Definition of done

Second Haiku eval (2026-10-16, after T115-T118): Topic boundary PASS; no-guessing FAIL 76.5 %, 1 ungrounded; failing: AC-14b-hours-followup (no card: the T117 router rule made 'make it 25 hours' read), AC-16-custom-price (model passed the catalogue price 50.00 the Freelancer never wrote; the Customer's custom price was expected), AC-05b-own-profile/-uk/-folded (reply explains the own sender profile but does not ask which Customer with a question; -folded: model moved the name to senderProfile and gave no Customer), AC-14-many-studios (reply says 'multiple Customers' instead of the count 12). Review: _review/review-2026-10-16-t115-t118.md. Review B1. lib/ai/router.ts SYSTEM: replace the T117 sentence: a request to change a draft or invoice already saved in the app (one from the invoice list, e.g. INV-0042: add or remove a line, edit a value, mark paid) is 'read'; changing the draft card shown in this Conversation before it is created ("make it 25 hours", "add a line", "use EUR") is 'draft'. Unit test in tests/unit/lib/ai/router.test.ts asserting both rules (replace the T117 assertion). AC refs: ai-assistant AC-14b (follow-up card) and ai-assistant AC-15 (intent guard); fix the T117 comment in router.test.ts:148 that cites ai-chat-v2 AC-15.
