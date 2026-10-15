---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0008 — Keep invoice states in one workspace store fed by loads and action results, without push

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

After issuing, "the preview, the card and every link to it in the Conversation show it as issued" (AC-23). A deleted draft shows "no longer available" on the panel and the card (AC-21), and one issued elsewhere shows as issued (AC-26). Spec §1 limits live status to the draft card and its system-made links. Today link and card states are read on the server when a Conversation renders (`readInvoiceStates`, `toDraftCardView`), and a later change is seen only after a reload. `router.refresh()` after an action risks the remount found in fix 2026-10-12. This was ux-flows design input (2). SAD §4 seed 5.

## Decision drivers

- AC-21, AC-23, AC-26: three surfaces (panel, card, links) must agree right after a press.
- No new infrastructure (SAD §2: no realtime or push service).
- No route refresh inside the mounted chat island.

## Considered options

1. **A client store in the workspace.** It maps invoice id → status, number and availability. Page loads seed it, and `loadInvoicePreview`, `issueFromPreview` and `createDraftFromCard` results update it. Card, `ChatLink` and panel read it.
2. **`router.refresh()` after each issue or preview**, re-rendering the Conversation with fresh server states.
3. **Push or polling** of invoice states for the open Conversation.

## Decision outcome

**Chosen:** Option 1. Every place that learns a new state (a load or an action result) writes it once, every place that shows it reads it, and nothing navigates or polls. Option 2 re-renders the route around the island, which is exactly what the reload fix removed, and costs a full Conversation read per press. Option 3 adds a channel and a background load for a status the spec only needs after the Freelancer's own action or on the next look.

## Consequences

**Positive**
- The panel, the card and every link change together on the issue result.
- The first iteration's server-read states still seed the store on every page load.

**Negative**
- A change made in another tab shows only on the next preview load, issue attempt or reopen. This is accepted debt (SAD §11), within spec §1.

**Neutral**
- The store lives in the workspace provider beside `NewConversationProvider`, and does not survive leaving the AI section.

## Links

- Spec: [[../spec.md]] §1 "Live invoice status", AC-21, AC-23, AC-26
- SAD: [[../sad.md]] §4, §8 "Client state", §11
- Related ADR: [[0006-load-the-chats-invoice-preview-through-an-owner-scoped-server-action-and-the-shared-document-model]], [[0007-issue-from-the-preview-through-the-invoice-status-service-guarded-by-the-version-the-preview-showed]]; ai-assistant ADR-0008
