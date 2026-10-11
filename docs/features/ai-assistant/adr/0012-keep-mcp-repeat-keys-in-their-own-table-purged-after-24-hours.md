---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0012 — Keep MCP repeat keys in their own table purged after 24 hours

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

An external Assistant that lost the answer to a network failure repeats the creation request marked as a repeat; no second draft may be created and the answer points to the first. A repeat mark is honoured for 24 hours, the same mark with different content is refused, and an identical request without a mark creates a new draft (AC-32).

## Decision drivers

- AC-32; spec §6.1 "Duplicate drafts on retries".
- Spec §6: draft created ≤ 2 s p95 server-side.

## Considered options

1. **Own table** — `McpDraftRepeat` with a unique (key id, repeat key), the request fingerprint, the invoice id and the creation time, written in the invoice's transaction and purged daily after 24 h.
2. **Columns on the invoice** — the repeat key and fingerprint stored on `Invoice` with a unique index per key.

## Decision outcome

**Chosen:** Option 1. The 24-hour window is a plain time filter and the rows disappear afterwards; option 2 keeps transport details on invoices forever, makes a key reusable only by dropping the unique index, and loses the record when the draft is deleted.

## Consequences

**Positive**
- Concurrent repeats collide on the unique index; the loser returns the winner's draft.

**Negative**
- One more table and one more step in the daily cron.

**Neutral**
- A repeat whose first draft was since deleted answers that the draft is no longer available, without creating a new one.

## Links

- Spec: [[../spec.md]] §6.1, AC-32
- SAD: [[../sad.md]] §5, §7
- Related ADR: [[0011-list-the-mcp-draft-tool-to-every-key-and-refuse-it-without-draft-permission]]
