# T118 — Eval report prints why each failing row failed

- **Layer:** backend
- **Deps:** T114
- **AC:** —

## Definition of done

Eval on Claude Haiku 5.5 (owner run 2026-10-16, pnpm eval:assistant): Topic boundary FAIL (one mixed row 'Add a line for the website to my draft and write me a slogan for it' got intent draft, expected read); No-guessing FAIL (70.6 % incomplete/ambiguous ending in a question, need 100 %; 2 ungrounded values; failing AC-16-custom-price, AC-19-use-revolut, AC-05b-own-profile(-uk,-folded), AC-14-many-studios(-uk), yesterday-date). The log shows Haiku calling propose_draft with both customer and customerId, or with no Customer at all, and the tool input schema refusing ('Give exactly one of customer and customerId'); once ask_user with an empty line description. evals/assistant/run.ts: after the report, for every no-guessing row that fails in the last run print '  - <id>: <reasons joined by '; '>' using noGuessingRowFailures, plus the reply text truncated to 200 chars; for every topic row that fails print its text, expected and got. Scored behaviour unchanged. Unit test via evaluateRun or a new exported formatter in run.ts/score.ts (tests/unit/evals/ or wherever the eval unit tests live).
