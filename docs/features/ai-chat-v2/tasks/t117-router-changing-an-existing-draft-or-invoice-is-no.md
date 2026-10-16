# T117 — Router: changing an existing draft or invoice is not a drafting intent

- **Layer:** backend
- **Deps:** T114
- **AC:** AC-15

## Definition of done

Eval on Claude Haiku 5.5 (owner run 2026-10-16, pnpm eval:assistant): Topic boundary FAIL (one mixed row 'Add a line for the website to my draft and write me a slogan for it' got intent draft, expected read); No-guessing FAIL (70.6 % incomplete/ambiguous ending in a question, need 100 %; 2 ungrounded values; failing AC-16-custom-price, AC-19-use-revolut, AC-05b-own-profile(-uk,-folded), AC-14-many-studios(-uk), yesterday-date). The log shows Haiku calling propose_draft with both customer and customerId, or with no Customer at all, and the tool input schema refusing ('Give exactly one of customer and customerId'); once ask_user with an empty line description. lib/ai/router.ts SYSTEM: intent 'draft' only for a request to create a new invoice or draft, or an answer to a question about a draft in progress; a request to change an existing draft or invoice (add or remove a line, edit a value) is 'read' (the assistant cannot edit; it explains and links). Unit test asserting the router prompt carries that rule.
