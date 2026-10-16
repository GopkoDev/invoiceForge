# T124 — Chat instructions: the Customer named earlier in the Conversation is carried over; no false 'fills' promise

- **Layer:** backend
- **Deps:** T121
- **AC:** ai-assistant AC-14b, AC-45
- **Source:** [re-review T119–T122](../_review/review-2026-10-16-t115-t118.md)

## Definition of done

Re-review of T119–T122 (_review/review-2026-10-16-t115-t118.md, second table). W-4: chat.ts:15 rule becomes 'when the Freelancer named a Customer in this Conversation (including the one on the card being changed), always pass it in `customer` exactly as the Freelancer wrote it ...; when they named none, leave it out; propose_draft asks.' N-4: chat.ts:16 '... leave it out; propose_draft fills the price from the catalogue or the Customer's custom price, or asks.' Update tests/unit/lib/ai/chat-instructions-haiku-rules.test.ts. N-3 already fixed in tasks.json by the orchestrator.
