---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0008 — Store Conversations in Prisma tables keeping only what the Freelancer saw

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Conversations are listed newest first, reopened and continued, deleted one or all on request, deleted automatically 90 days after their last message, included in the data export and removed with the account (today one explicit Prisma transaction — architecture-hardening ADR-0007). They hold Customer names and amounts. The model receives the latest 40 messages as history. Mastra offers its own Memory store for threads and messages (ADR-0004).

## Decision drivers

- Spec §6.1: Conversations are Confidential; the Conversation is the only copy of message content.
- Spec §6: conversation history sent to the model capped at the latest 40 messages; cost per message ≤ USD 0.02 p95; automatic deletion within 24 h after the 90-day mark.
- AC-35–AC-39, AC-41.

## Considered options

1. **Own Prisma tables, visible content only** — a new `prisma/schema/ai.prisma` with Conversation and its messages in the AI SDK UI-message shape; a message keeps the Freelancer's text, the Assistant's final text, link targets as ids and a reference to its Draft card. Raw tool answers are not stored.
2. **Own Prisma tables, full turns** — the same tables keeping every tool call and tool answer.
3. **Mastra Memory** — Conversations as Mastra threads in Mastra's store.

## Decision outcome

**Chosen:** Option 1. Export, retention, owner checks and account deletion stay in the existing transaction model; what is stored is exactly what the Freelancer saw, so the export matches the screen and the history replayed to the model stays small. Option 2 keeps snapshots of Customer data the Freelancer never saw and replays them into every later message; option 3 moves Confidential data outside the account-deletion transaction and into a schema that changes with Mastra versions.

## Consequences

**Positive**
- Link states (issued / no longer available — AC-36) are computed when a Conversation is opened from the stored invoice ids, never frozen.
- Less personal data at rest and cheaper history.

**Negative**
- A follow-up about figures shown earlier may call a read tool again (one more step within the 8-step cap) instead of reusing stored tool answers.
- The app writes and trims history itself (no framework memory).

**Neutral**
- Message parts are stored as JSONB; the UI renders them with the same `useChat` message type.

## Links

- Spec: [[../spec.md]] §6, §6.1, AC-35–AC-39, AC-41
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0004-use-mastra-for-the-agent-and-metadata-only-tracing]], [[0007-store-draft-cards-server-side-and-create-only-from-a-create-server-action]]
