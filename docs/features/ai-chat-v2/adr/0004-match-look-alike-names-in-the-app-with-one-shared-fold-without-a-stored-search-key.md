---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0004 — Match look-alike names in the app with one shared fold, without a stored search key

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

The Customer search, the product read and the Conversation title search must all ignore case, extra spaces and look-alike Latin/Cyrillic letters, "like the draft action already does" (spec §1, AC-03, AC-17). The draft resolver has `foldName` (`lib/services/assistant-drafts/match-name.ts`, `server-only`), from fix 2026-10-12. The reads must answer within 800 ms p95 for 20 sender profiles, 500 products and 2,000 Customers. SAD §4 seed 3.

## Decision drivers

- Spec §6 "Look-alike name search: 100 % of the look-alike fixture set … matches in the chat, MCP and the Conversation search". That means one rule, three call sites.
- Spec §6 "New read questions p95 ≤ 800 ms server-side" at the stated sizing.
- Avoid two implementations of one rule (TypeScript and SQL) that can drift.

## Considered options

1. **Fold in the app.** Move `foldName` to an isomorphic `lib/helpers/fold-name.ts`. The reads load the owner's id/name rows and filter with it. The client filters the Conversation titles with the same function.
2. **A stored folded key.** Persist `nameFolded` on Customer and Product (and `titleFolded` on Conversation), written on every save and indexed, and search with SQL `LIKE`.
3. **Fold in SQL at query time** with `normalize()`, `lower()`, `regexp_replace()` and `translate()` mirroring the TypeScript map.

## Decision outcome

**Chosen:** Option 1. One function, one fixture set, one place to change. At the spec's sizing, loading 2,000 short name rows is far within 800 ms. Option 2 adds columns, a backfill and write-path hooks on three models for a speed-up the sizing does not need, and changing the fold rule later means a re-backfill. Option 3 keeps a second copy of the rule in SQL that the fixture set would have to cover separately.

## Consequences

**Positive**
- The chat, MCP and the title search match identically by construction.
- No migration, and no write-path change on Customer or Product.

**Negative**
- Each search reads all of the owner's names before filtering: O(n) per call.
- `foldName` must stay free of server-only imports, so it can run on the client.

**Neutral**
- Above roughly 20,000 Customers per Freelancer, revisit option 2 (SAD §7 threshold). The function stays the single definition of the fold either way.

## Links

- Spec: [[../spec.md]] §1 "The reads search by name", AC-03, AC-17; §6
- SAD: [[../sad.md]] §4, §5, §8 "Name matching"
- Related ADR: ai-assistant fix 2026-10-12 look-alike names
