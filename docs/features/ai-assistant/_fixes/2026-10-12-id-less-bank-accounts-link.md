---
slug: ai-assistant
date: 2026-10-12
triage: regression
acs: [AC-07, AC-35]
commit: pending
recurrence_of: none
---

# Fix: reopening a Conversation crashes on a bank-accounts link without a sender profile

## Symptom

The owner reopened Conversation `v7hebjeez5iripbze2hjqf3p` and expected the whole exchange (AC-35). Instead, the server render failed with `Error: sender-profile-bank-accounts needs a senderProfileId at appPageRoute (lib/ai/app-map.ts:114) at ChatLink (components/ai/chat-link.tsx:23)`, and Next.js switched to client rendering. The cause was the last Assistant message (position 11). It stores the link `{ "kind": "page", "page": "sender-profile-bank-accounts" }` with no `senderProfileId`. That turn called `find_in_app`. This read-only dev DB query found no other message with such a link.

## Root cause

`linksFromToolResult` in `lib/ai/run-turn.ts` turned every page `find_in_app` found into `{ kind: 'page', page }`. `find_in_app` answers from the fixed app map and knows no sender profile. When the topic matched bank accounts, the reply stored a bank-accounts link without the profile id. `appPageRoute` (`lib/ai/app-map.ts`) throws for that page without an id, by design. `ChatLink` (`components/ai/chat-link.tsx`) called it during render, so one stored link took down the whole page. The tests covered `find_in_app` links only for the logo topic and the bank-accounts link only with an id, so this pair was never exercised.

## The pinning test

- Unit, `tests/unit/lib/ai/run-turn-find-in-app-links.test.ts`:
  - "the bank-accounts page found with no sender profile becomes the sender profiles page". Before the fix it failed with `AssertionError: expected [ { kind: 'page', …(1) }, …(1) ] to deep equally contain { kind: 'page', …(1) }`.
  - "every link it stores is valid and renders to a route". Before the fix it failed with `expected [Function] to not throw an error but 'Error: sender-profile-bank-accounts n…' was thrown`.
- Component, `tests/component/chat-link.test.tsx`, "links to the sender profiles page instead of throwing". Before the fix it failed with `Error: sender-profile-bank-accounts needs a senderProfileId`, which is the reported crash.

The fix has two parts:
- **Producer.** A `find_in_app` bank-accounts page becomes a link to the sender profiles list. Each profile's accounts are reached from that list. Links from `propose_draft` still carry the profile id and are unchanged.
- **Renderer.** `ChatLink` renders an already-stored bank-accounts link without an id as the sender profiles link. The existing row in the dev DB now renders. `appPageRoute` still throws for a missing id, so a new caller cannot build a broken route silently.

## Spec patch

None. The spec was right: AC-07 says the chat "only ever links to pages that exist", and AC-35 says opening a Conversation shows the whole exchange. Both are re-verified by the tests above.

## Follow-ups

- None.
