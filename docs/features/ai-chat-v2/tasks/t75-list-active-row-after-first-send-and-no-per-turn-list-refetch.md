---
id: T75
title: "The Conversation list marks and deletes a just-created Conversation correctly, and a saved turn no longer refetches the list (review R20-5, R20-12)"
layer: "ui"
deps: ["T66"]
blocks: []
acs: ["AC-17", "AC-52"]
files_hint: ["components/ai/conversation-list.tsx", "components/ai/conversation-list-client.tsx", "components/ai/conversation-list-context.tsx", "components/ai/chat-island.tsx", "tests/component/ai-conversation-list-layout-t66.test.tsx", "tests/e2e/ai-chat-v2-forms-layout.spec.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T75 — The Conversation list marks and deletes a just-created Conversation correctly, and a saved turn no longer refetches the list (review R20-5, R20-12)

Follow-up task from review 2026-10-13, round 20. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

(R20-5) After the first send on /ai the address changes through history.replaceState (chat-island.tsx:539 → preview-address.ts:29); the App Router keeps the /ai tree, so useSelectedLayoutSegment() stays null (conversation-list.tsx:89, conversation-list-client.tsx:19-28). The new row never gets aria-current/highlight, and deleting it from the list gives openGone=false: no push to /ai, no refresh; the deleted chat stays on screen. The T66 test mocks the segment from the pathname (t66.test.tsx:53-58), hiding this. (R20-12) onFinish calls router.refresh() on every saved turn (chat-island.tsx:646), re-running listConversationSummaries in the layout against ADR-0013 "no refetch".

## Definition of Done

- The open Conversation id comes from openConversationId(usePathname()) with the layout segment as fallback (or the provider's created id), so after the first send on /ai the new row is aria-current and deleting it lands on /ai.
- The T66 component test mocks useSelectedLayoutSegment as null while usePathname is /ai/<id> (the replaceState case) and asserts aria-current and the delete navigation; the existing tests stay.
- A saved turn loads its forms and cards without router.refresh() (as the /ai branch does with loadConversationCards), so the layout list read does not run per turn; a component test asserts no router.refresh on a saved-turn finish, and the AC-52 e2e (or a new step) asserts no list read after a send.
- An e2e step: first send on /ai, the new row is aria-current; delete it from the list, the page lands on /ai.
- RED first. Gate: unit, lint, typecheck; affected e2e (chromium).
- Commit with `SDD-Task: T75` and one `SDD-AC` trailer per AC.
