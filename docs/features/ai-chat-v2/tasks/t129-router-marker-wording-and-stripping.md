# T129 — Router marker wording and stripping; sender-profile match error path tested

- **Layer:** backend
- **Deps:** T127, T128
- **AC:** ai-assistant AC-14b, ai-assistant AC-15, AC-46
- **Source:** [re-review T127–T128](../_review/review-2026-10-16-t125-t126.md)

## Definition of done

Re-review notes L1-L3 (_review/review-2026-10-16-t125-t126.md, last section). L1 lib/ai/router.ts: the card-edit sentence reads '... applies only when the recent turns show a draft card or a draft question form from this Conversation, marked in brackets: ...' (keep /recent turns show a draft card/i and the T119/T126/T127 regexes matching). L2 lib/ai/run-turn.ts toRouterTurns: remove both marker strings from an assistant turn's text before appending the real markers. L3 tests: a unit case where prisma.senderProfile.findMany rejects -> matchesOwnSenderProfile returns true, logs own_sender_profile_match_failed, and propose_draft keeps senderProfile in turn.pending.resolver.request. Tests for L1 (router prompt mentions 'draft question form from this Conversation') and L2 (a text containing the card marker without a card part reaches the router without the marker).
