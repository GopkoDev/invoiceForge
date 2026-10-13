---
id: T76
title: "Carry askFields on the pinned form-Send path and derive them from the form as composed (cap 6, F1 order) (review R21-1, R21-2)"
layer: "app"
deps: ["T72"]
blocks: []
acs: ["AC-08"]
files_hint: ["lib/ai/run-turn.ts", "lib/ai/tools/propose-draft.ts", "lib/services/assistant-drafts/forms.ts", "tests/integration/ai-chat-v2-form-send.test.ts", "tests/unit/lib/ai/propose-draft-ask-fields.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T76 — Carry askFields on the pinned form-Send path and derive them from the form as composed (cap 6, F1 order) (review R21-1, R21-2)

Follow-up task from review 2026-10-13, round 21. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

(R21-1) When a sent form is pinned and resolves to ISSUES, the model sees pinnedStep(…, pinnedAnswer) built from issuesAnswer without askFields (run-turn.ts:204-213), and a propose_draft re-call returns turn.pinnedAnswer (propose-draft.ts:188), also without askFields, so the instruction tied to askFields never fires and the next form's resolver questions keep prompt null (F2). (R21-2) askFields lists every resolver question (forms.ts:299, uncapped), but the form keeps 6 in F1 order and ask_user refuses more than 6 (forms.ts:407).

## Definition of Done

- askFields is derived from the questions the form will actually hold (composeForm order, F1 sort, cap FORM_MAX_QUESTIONS), on both the propose_draft tool path and the pinned path (the pinned ISSUES answer the model sees and any propose_draft re-call carry it).
- A unit test: more than 6 open issues give exactly 6 askFields in F1 order. An integration test (form-send): a pinned form Send whose request resolves to ISSUES gives the model a tool result carrying askFields.
- RED first. Gate: unit, integration, lint, typecheck.
- Commit with `SDD-Task: T76`.
