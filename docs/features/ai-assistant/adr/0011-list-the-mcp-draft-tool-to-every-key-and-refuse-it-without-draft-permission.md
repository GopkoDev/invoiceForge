---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0011 — List the MCP draft tool to every key and refuse it without Draft permission

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Draft permission is opt-in, chosen only when a Personal key is created and never added later; every key that existed before this release stays read-only (spec §3, §6.1). MCP tool registration is read-only by construction today (`registerReadOnlyTool` fixes `readOnlyHint: true`). AC-29 requires a read-only key's attempt to be refused with an explanation.

## Decision drivers

- Spec §6.1: a key that may already have leaked must never gain write access silently.
- AC-25–AC-29.
- The MCP server is built per request with the key's context (`createMcpServer(context)`), so per-key listing is possible.

## Considered options

1. **List to every key, refuse without permission** — `create_draft_invoice` appears in `tools/list` for all keys with `readOnlyHint: false` and a description naming Draft permission; the handler refuses read-only keys with the AC-29 explanation.
2. **List only to keys with permission** — register the tool only when `canCreateDrafts` is true; a call by name from a read-only key is still refused.

## Decision outcome

**Chosen:** Option 1. The Assistant can tell the Freelancer that drafting exists and how to enable it, one listing is contract-tested, and the refusal is the same code path either way.

## Consequences

**Positive**
- `PersonalKey.canCreateDrafts` is written only by the create-key service; no update path exists, so permission cannot be added to an existing key (AC-26).
- `registerDraftTool` makes the permission check, the per-key daily limit and the repeat-key check mandatory parts of registration, as `registerReadOnlyTool` does for annotations.

**Negative**
- Read-only keys see a tool they cannot use; some clients will try it and be refused.
- The "every tool is read-only" invariant ends; the contract test now asserts exactly one non-read-only tool.

**Neutral**
- Hiding the tool later is a registration condition, no schema change.

## Links

- Spec: [[../spec.md]] §3, §6.1, AC-25–AC-29
- SAD: [[../sad.md]] §5, §8
- Related ADR: mcp-server ADR-0003, ADR-0004
