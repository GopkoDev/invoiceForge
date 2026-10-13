---
id: T72
title: "Give resolver-raised questions chat-written question text and fix the instructions' tool sentence (review R20-11, R20-9)"
layer: "app"
deps: ["T63"]
blocks: []
acs: ["AC-08", "AC-46"]
files_hint: ["lib/services/assistant-drafts/forms.ts", "lib/ai/tools/propose-draft.ts", "lib/ai/instructions/chat.ts", "tests/unit/ai/chat-instructions.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

# T72 — Give resolver-raised questions chat-written question text and fix the instructions' tool sentence (review R20-11, R20-9)

Follow-up task from review 2026-10-13, round 20. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

Questions the resolver raised carry `prompt: null` unless the chat repeats the field through ask_user, and FIELD_INVALID questions use the resolver's English `issue.message` (forms.ts:168, :267). F2 requires one line of question text written by the chat in the language of the Freelancer's message. Separately, chat.ts:7 lost its "and" before "prepare a Draft invoice card", garbling the tool list.

## Definition of Done

- FIELD_INVALID questions no longer use the resolver's English message as the question text.
- When propose_draft answers with open issues, its tool result lists the fields that will be asked (field and line), and the instructions tell the model to call ask_user once with a one-line prompt in the Freelancer's language for each of those fields (composeForm already merges chat prompts into resolver questions by field). A unit test proves composeForm keeps the resolver's options and takes the chat's prompt for the same field and line; a unit test pins the propose_draft ISSUES result shape.
- chat.ts:7 reads "…find pages in the app with find_in_app, prepare a Draft invoice card with propose_draft, and ask the Freelancer…"; a unit test pins the sentence.
- An eval row (evals/assistant) for a resolver question receiving a prompt is added if the harness has a fitting check. RED first. Gate: unit, integration, lint, typecheck.
- Commit with `SDD-Task: T72` and one `SDD-AC` trailer per AC.
