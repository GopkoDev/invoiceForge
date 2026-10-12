---
id: T42
title: "Answer an MCP repeat with the first answer's stored proposal and the invoice's current status"
layer: "ports"
deps: ["T37"]
blocks: []
acs: ["AC-30", "AC-32"]
files_hint: ["prisma/schema/auth.prisma", "prisma/migrations/", "docs/features/ai-assistant/migrations/", "docs/features/ai-assistant/data-model.md", "lib/services/assistant-drafts/create-for-key.ts", "lib/services/assistant-drafts/repeat-marks.ts", "docs/features/ai-assistant/contracts/openapi.yaml", "tests/integration/services/assistant-drafts/create-for-key.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
origin: "review-2026-10-12 round 2"
---

# T42 — Answer an MCP repeat with the first answer's stored proposal and the invoice's current status

Follow-up from the round-2 re-review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md) §Re-review (round 2)). Findings: N-1, N-10 — read each row there and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-30, AC-32 — verbatim in [spec.md §5](../spec.md); screens in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

McpDraftRepeat stores the first answer's DraftProposal (new nullable JSON column, staged + live migration with rollback); a repeat returns that proposal (true sources, defaultsUsed, rate sources) with the stored invoice's current status and number; rows written before the column existed fall back to the stored invoice in INVOICE_ITEM_ORDER, documented in openapi.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Trailers `SDD-Task: T42`, one `SDD-AC` per AC, one `SDD-Review: N-x` per finding. Append the resolution line per finding to the review record.
