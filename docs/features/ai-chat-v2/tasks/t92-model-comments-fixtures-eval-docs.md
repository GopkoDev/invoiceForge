---
id: T92
title: "Code comments, span fixtures and eval docs match ADR-0014 and ADR-0011 (review 2026-10-15 F8-F10)"
layer: "tests"
deps: ["T89"]
blocks: []
acs: []
files_hint: ["lib/ai/model.ts", "tests/unit/lib/ai/run-turn-paced-text.test.ts", "tests/contract/ai-spans-metadata-only.test.ts", "evals/assistant/README.md", "evals/assistant/dataset.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T92 — Code comments, span fixtures and eval docs match ADR-0014 and ADR-0011 (review 2026-10-15 F8-F10)

Follow-up task from the ADR-0014 review of 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md).

## Problem

`lib/ai/model.ts:3` cites an ambiguous, superseded 'ADR-0003'; `tests/unit/lib/ai/run-turn-paced-text.test.ts:2` describes Gemini in the present tense; `tests/contract/ai-spans-metadata-only.test.ts` uses Gemini span fixtures; `evals/assistant/README.md:12` and `evals/assistant/dataset.ts:56-58` describe a `choice` press path the runner no longer uses (since ADR-0011 it answers a one-question form, `run.ts:356-408`).

## Definition of Done

- `lib/ai/model.ts:3` cites ai-chat-v2 ADR-0014 (supersedes ai-assistant ADR-0003). The paced-text test header says the model then in use (Gemini Flash-Lite) wrote in one burst. The span contract fixtures use `anthropic/claude-haiku-5.5` and an Anthropic span name, and the test stays green. README and dataset.ts say a `press` row answers the offered form question whose option has that label, as a one-answer form Send. No behaviour change. Gate: unit, contract, `pnpm eval:assistant:dry`, lint, typecheck.
- Commit with `SDD-Task: T92`.
