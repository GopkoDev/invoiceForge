---
id: T93
title: "ADR-0014, SAD, spec, architecture map and ship docs are exact about the model switch (review 2026-10-15 F2-F4, F6-F8)"
layer: "docs"
deps: ["T90", "T91", "T92"]
blocks: []
acs: ["AC-35"]
files_hint: ["docs/features/ai-chat-v2/adr/0014-run-the-chat-on-claude-haiku-5-5-through-the-ai-gateway-on-paid-terms.md", "docs/features/ai-chat-v2/sad.md", "docs/features/ai-chat-v2/spec.md", "docs/architecture-map.md", "docs/features/ai-chat-v2/_ship/pr-body.md", "docs/features/ai-chat-v2/_ship/changelog.md"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T93 — ADR-0014, SAD, spec, architecture map and ship docs are exact about the model switch (review 2026-10-15 F2-F4, F6-F8)

Follow-up task from the ADR-0014 review of 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md).

## Problem

ADR-0014 cites an unsourced price and lists one privacy test and only the terms sub-processor gap; spec §6.1 and sad §2 say 'No new processor' while announcing one; sad §9 prose lists 'model' as staying in force; docs/architecture-map.md:59,201 still describe Gemini on a free-tier key; the PR body and changelog must reflect T90-T92.

## Definition of Done

- ADR-0014 cites the Vercel AI Gateway model list (`/v1/models`, read 2026-10-15: USD 0.10 / 0.50 per million input / output tokens up to 100k context, 5x above) and adds that tier to Negative; its consequences name the privacy §5 and terms §10 tables and the three tests T90 changed, and the cost-unknown handling of T91. spec.md:655 and sad.md:60 read 'The model provider changes (Google → Anthropic); no other processor is added', noting the security addendum covers it. sad.md §9 prose no longer lists 'model' as in force. architecture-map.md:59,201 name Claude Haiku 5.5 on paid terms (ai-chat-v2 ADR-0014). PR body and changelog list T90-T93 and drop the privacy rewrite from the owner's to-do (wording approval and the Last-updated date stay owner gates). Gate: lint (markdown), no code change.
- Commit with `SDD-Task: T93`.
