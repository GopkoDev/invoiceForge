# T127 — Router sees a code-built marker for a draft card or a draft in progress

- **Layer:** backend
- **Deps:** T126
- **AC:** ai-assistant AC-14b, ai-assistant AC-15
- **Source:** [review T125–T126](../_review/review-2026-10-16-t125-t126.md)

## Definition of done

Review _review/review-2026-10-16-t125-t126.md. Finding 1. lib/ai/run-turn.ts: for the router only (classifyMessage recentTurns), map an assistant turn that holds a data-draft-card part to its text plus a fixed system marker '[A draft card was shown in this reply.]', and one that holds a Question form (the form/offer part the conversation stores) to '[A draft question form was shown in this reply.]'. The model's own history (toModelTurns for the agent) stays unchanged. lib/ai/router.ts SYSTEM: the card-edit rule refers to those markers: a change while the recent turns show a draft card or a draft question form (marked in brackets) is 'draft'; without one, a change to 'my draft' or an invoice is about a saved draft and is 'read'. Keep the existing router test assertions passing (adjust only where the wording intentionally changes). Unit tests: runTurn passes the marker to classifyMessage for a history with a card part and with a form part; the marker is not in the agent's messages; router prompt mentions the markers.
