---
id: T85
title: "Refuse the removed dashboard prompt origins on a chat request; keep them readable for history (consistency C5)"
layer: "app"
deps: []
blocks: []
acs: ["AC-29", "AC-34"]
files_hint: ["lib/validations/assistant-chat.ts", "app/api/chat/route.ts", "tests/contract/ai-chat-v2-chat-request.contract.test.ts", "tests/e2e/route-sweep.spec.ts", "docs/features/ai-chat-v2/contracts/openapi.yaml"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T85 — Refuse the removed dashboard prompt origins on a chat request; keep them readable for history (consistency C5)

Follow-up task from the docs/code consistency pass 2026-10-14 (critic + reviewer over ux-flows, screens, spec, contracts vs code). Source: [`_review/consistency-2026-10-14.md`](../_review/consistency-2026-10-14.md).

## Problem

The dashboard prompt and its handoff were removed (T80, AC-29/31/32 removed by the owner) but `lib/validations/assistant-chat.ts` still accepts `origin: DASHBOARD` with `startedFrom: DASHBOARD_PROMPT`, so any client can still create new rows the spec says only stay readable for history.

## Definition of Done

- A chat request with `origin: 'DASHBOARD'` or `startedFrom: 'DASHBOARD_PROMPT'` is refused with 400 (field-keyed issue on `origin` / `startedFrom`) and creates nothing; `TYPED` and the remaining start points (`AI_SECTION`, `INVOICE_LIST`, `DASHBOARD_CREATE`) are unchanged. Stored DASHBOARD / DASHBOARD_PROMPT rows keep reading and exporting (DB enums and read-side schemas untouched). The DASHBOARD_TOGETHER refinement and its message go. Update the contract test `tests/contract/ai-chat-v2-chat-request.contract.test.ts`, `tests/e2e/route-sweep.spec.ts` and any unit/integration test that sends DASHBOARD; update `contracts/openapi.yaml` (request enums, drop the `dashboardPrompt` example, keep the response/history enums). RED first. Gate: unit, integration, lint, typecheck.
- Commit with `SDD-Task: T85`.
