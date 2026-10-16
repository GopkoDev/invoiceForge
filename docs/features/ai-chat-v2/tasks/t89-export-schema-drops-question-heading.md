---
id: T89
title: "The export schema no longer allows the form question heading the export never writes (consistency C9)"
layer: "tests"
deps: ["T88"]
blocks: []
acs: ["AC-33"]
files_hint: ["docs/features/security-patch/contracts/openapi.yaml", "tests/contract/ai-chat-v2-export.contract.test.ts", "lib/services/account/account.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T89 — The export schema no longer allows the form question heading the export never writes (consistency C9)

Follow-up task from the docs/code consistency pass 2026-10-14 (critic + reviewer over ux-flows, screens, spec, contracts vs code). Source: [`_review/consistency-2026-10-14.md`](../_review/consistency-2026-10-14.md).

## Problem

The export never emits `heading` (account.ts) but the living export schema still lists it as optional and the contract fixture still sends it, so a returning heading would not be caught. Header comments still say export 2.3.

## Definition of Done

- `heading` is removed from the export form-question schema (docs/features/security-patch/contracts/openapi.yaml and any code-side schema the export contract test uses) and from the fixture in `tests/contract/ai-chat-v2-export.contract.test.ts`; with `additionalProperties:false` a question carrying `heading` now fails the contract (assert it). Test header comments say 2.4. exportVersion stays '2.4' (never shipped). Gate: unit, integration (export), lint, typecheck.
- Commit with `SDD-Task: T89`.
