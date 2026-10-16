# T116 — Chat instructions: pass the Customer as written, never move it to the sender profile

- **Layer:** backend
- **Deps:** T115
- **AC:** AC-05b, AC-14, AC-45

## Definition of done

Eval on Claude Haiku 5.5 (owner run 2026-10-16, pnpm eval:assistant): Topic boundary FAIL (one mixed row 'Add a line for the website to my draft and write me a slogan for it' got intent draft, expected read); No-guessing FAIL (70.6 % incomplete/ambiguous ending in a question, need 100 %; 2 ungrounded values; failing AC-16-custom-price, AC-19-use-revolut, AC-05b-own-profile(-uk,-folded), AC-14-many-studios(-uk), yesterday-date). The log shows Haiku calling propose_draft with both customer and customerId, or with no Customer at all, and the tool input schema refusing ('Give exactly one of customer and customerId'); once ask_user with an empty line description. lib/ai/instructions/chat.ts (frozen prefix; edit wording only): in 'Asking and drafting' add: always pass the Customer in `customer` exactly as the Freelancer wrote it, even when a search found several or no matching Customers (propose_draft turns that into the right question); pass customerId only from a form answer, never together with `customer`; never leave the Customer out because a search was unclear. In 'Sender profile and Customer': when the name the Freelancer gives as the Customer is one of their sender profiles, still pass it as `customer` (propose_draft refuses it and you then explain and ask), never as senderProfile. Unit test on CHAT_INSTRUCTIONS asserting these sentences exist (tests/unit/lib/ai/ instructions test, existing file if present).
