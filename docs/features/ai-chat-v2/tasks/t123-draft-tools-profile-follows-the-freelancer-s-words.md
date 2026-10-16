# T123 — Draft tools: profile follows the Freelancer's words, own-profile notice checked, answered ids tested

- **Layer:** backend
- **Deps:** T120
- **AC:** AC-05b, AC-10, AC-14
- **Source:** [re-review T119–T122](../_review/review-2026-10-16-t115-t118.md)

## Definition of done

Re-review of T119–T122 (_review/review-2026-10-16-t115-t118.md, second table). W-1: preferIds applies the answeredRecordIds rule to senderProfileId too (no form answer -> keep senderProfile, drop the id); flip the test at propose-draft-haiku-args.test.ts:68. W-2: before the own-profile wording, check the senderProfile name against the Freelancer's own sender profiles (owner-scoped, the same fold the resolver uses); only when it matches use the own-profile directive; otherwise NO_CUSTOMER_SAY. Pass the name as a separate data field of the answer (e.g. ownSenderProfile: { freelancerText: name }) instead of inside the directive sentence. Tests: matching name -> own-profile directive + data field; non-matching -> plain no-Customer directive. W-3: a runTurn-level test (pattern of tests/unit/lib/ai/tool-pending-commit.test.ts) - priorAnswers [{customerId:'c1'}] and a model call {customer:'Acme', customerId:'c1'} -> resolver receives customerId; an id not in priorAnswers -> resolver receives customer. N-1: the no-Customer commit uses the same call >= resolverCalls check and sets resolverCalls. N-2: update the stale comments. N-5: remove the dead pinned-request branch in run-turn.ts answeredRecordIds (or comment why), rename dropEmptyLines to nameBlankLines.
