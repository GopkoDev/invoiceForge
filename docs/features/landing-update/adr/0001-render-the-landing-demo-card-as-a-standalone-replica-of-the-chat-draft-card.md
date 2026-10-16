---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-16"
feature_size: "S"
ticket: "landing-update"
---

# 0001 — Render the Landing demo card as a standalone replica of the chat draft card

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** Dmytro Hopko (owner), architect — design pass at easy depth

## Context

The Landing demo must end on a card "laid out like the in-app chat's draft proposal card" (spec AC-02). The real card, `components/ai/draft-card.tsx`, is not presentational: it imports the `createDraftFromCard` server action, the chat's invoice-state contexts, `sonner`, `next/navigation` and the preview address helpers, and renders seven live states. The landing page is a public page that must reach no action or stored data (AC-03) and add at most 30 KB to its first load (spec §6). This feature is a temporary bridge that public-redesign replaces (spec §1).

## Decision drivers

- AC-03 and spec §6.1: the landing page reaches no AI chat, server action or Freelancer data.
- Spec §6 NFR: code added to the landing page's first load by the demo ≤ 30 KB compressed.
- Spec §1: temporary bridge — build the simplest credible version, no reuse aim.
- AC-02: the card must look like the chat's draft proposal card.

## Considered options

1. **Standalone replica** — a new presentational `DemoDraftCard` in `components/landing/landing-demo/`, built from the same `components/ui/` primitives (Card, Badge, Button, Separator) and tokens as the chat card, with fixed sample props; the chat is untouched.
2. **Extract a shared presentational core** — split `DraftCard` into a pure view used by both the chat and the landing page, with the live behaviour left in the chat wrapper.

## Decision outcome

**Chosen:** Option 1, standalone replica. It keeps the public page structurally unable to import the chat's server action and contexts, keeps the demo's bundle cost to one small component, and does not refactor a chat that has just shipped for a page that will be replaced; option 2 buys a guaranteed visual match at the price of a chat refactor and re-baselining its visual references.

## Consequences

**Positive**
- The public landing page imports nothing from `components/ai/` — AC-03's boundary holds by construction.
- No risk to the shipped chat or its visual baselines (`ai-draft-card-live`, `ai-draft-card-created`).
- public-redesign can delete the demo folder without touching the chat.

**Negative**
- The look is duplicated: a later change to the chat's draft card does not reach the demo automatically, so the two can drift until public-redesign replaces the demo.

**Neutral**
- Extracting a shared view later remains possible (about a day of work) if public-redesign's interactive demo wants the real card.

## Links

- Spec: [[../spec.md]] AC-02, AC-03, §6
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-server-render-the-demo-start-frame-and-show-the-finished-still-through-css-only-fallbacks]]
