# T122 — Docs and nits: integration on manual start in the test plans, AC refs, eval JSDoc, stray file

- **Layer:** docs
- **Deps:** T118
- **AC:** —
- **Source:** [review T115–T118](../_review/review-2026-10-16-t115-t118.md), second Haiku evaluation

## Definition of done

Second Haiku eval (2026-10-16, after T115-T118): Topic boundary PASS; no-guessing FAIL 76.5 %, 1 ungrounded; failing: AC-14b-hours-followup (no card: the T117 router rule made 'make it 25 hours' read), AC-16-custom-price (model passed the catalogue price 50.00 the Freelancer never wrote; the Customer's custom price was expected), AC-05b-own-profile/-uk/-folded (reply explains the own sender profile but does not ask which Customer with a question; -folded: model moved the name to senderProfile and gave no Customer), AC-14-many-studios (reply says 'multiple Customers' instead of the count 12). Review: _review/review-2026-10-16-t115-t118.md. Review W4, N1, N2, N3. docs/features/ai-chat-v2/test-plan.md (~255, ~333) and docs/features/ai-assistant/test-plan.md (~211): CI placement says unit/component/contract on every PR; integration on manual start only (gh workflow run test.yml --ref <branch>), available once the workflow with workflow_dispatch is on main; until then and as a habit run pnpm test:integration locally before a merge; not enforced by a required check. Same sentence about the default-branch requirement in tests/README.md §CI placement and docs/architecture-map.md CI line. Delete docs/features/ai-chat-v2/tasks/tracker.md-E. tasks.json T117 acs: replace AC-15 with ai-assistant AC-15 wording note ('ai-assistant AC-15') . evals/assistant/score.ts: move formatRowFailures above scoreNoGuessing's JSDoc so each JSDoc sits on its function. No tests (docs) except running the eval unit tests after the score.ts move.
