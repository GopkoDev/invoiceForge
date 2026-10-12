---
id: T37
title: "Answer an MCP repeat from the stored invoice and refuse a read-only key before validating input"
layer: "ports"
deps: ["T21", "T26"]
blocks: []
acs: ["AC-29", "AC-32"]
files_hint: ["lib/services/assistant-drafts/create-for-key.ts", "lib/mcp/server.ts", "lib/mcp/draft-tool.ts", "tests/integration/services/assistant-drafts/create-for-key.test.ts", "tests/contract/mcp-tools-list.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
origin: "review-2026-10-12"
---

# T37 — Answer an MCP repeat from the stored invoice and refuse a read-only key before validating input

Follow-up task from the independent review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md)). Findings: R-12, R-13 — read each finding's row there (file:line, problem, suggested fix) and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-29, AC-32 — verbatim text in [spec.md §5](../spec.md); screen states in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

A fingerprint-equal repeat within 24 h answers from the stored invoice (id, number, link, current rows and status) without re-resolving, even after data changed; a read-only key gets the AC-29 refusal before any argument validation.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Commit trailers `SDD-Task: T37`, one `SDD-AC` per AC, one `SDD-Review: R-xx` per finding. Append the resolution line per finding to the review record's Resolution log.
