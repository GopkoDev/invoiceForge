---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0010 — Share one read-tool registry between MCP and the chat

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The chat gets all seven existing read questions so the chat and MCP give the same answers (spec §1, roadmap D1). Today each read question is a file in `lib/mcp/tools/` holding its zod input and output schemas, its description and a handler that calls `lib/services/dashboard/assistant-reads` and friends with the actor.

## Decision drivers

- Spec §6: 100 % of chat figures equal the dashboard to the cent — the existing parity test, run through the chat's read path.
- AC-02–AC-05, AC-08, AC-40.

## Considered options

1. **One registry** — move the seven definitions to `lib/assistant-tools/`; MCP and the chat agent each register them through a thin adapter.
2. **Separate chat tools** — new Mastra tools calling the same services with their own schemas and answer shaping; `lib/mcp` untouched.

## Decision outcome

**Chosen:** Option 1. Identical answers hold by construction, the parity test runs on one set of handlers, and a future read question reaches both channels at once. Option 2 duplicates schemas whose partial-list and paging semantics (AC-04) would drift.

## Consequences

**Positive**
- `tests/contract/mcp-tools-list.test.ts` keeps guarding the MCP listing; a sibling test guards the chat's tool set from the same registry.

**Negative**
- A move-only refactor of `lib/mcp/tools/*` before chat work starts; imports and the read-only lint rule follow the new path.
- Descriptions are shared; a chat-specific wording is an explicit override in the chat adapter.

**Neutral**
- The data-not-instructions suffix that MCP adds to every description applies to the chat adapters too (§8).

## Links

- Spec: [[../spec.md]] §1, §6, AC-02–AC-05, AC-08
- SAD: [[../sad.md]] §5
- Related ADR: mcp-server ADR-0005 (one overdue rule)
