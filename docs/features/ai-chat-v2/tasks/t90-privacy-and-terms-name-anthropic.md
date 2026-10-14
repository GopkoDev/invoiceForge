---
id: T90
title: "The privacy and terms pages name Anthropic on paid terms as the model provider (review 2026-10-15 F1-F3)"
layer: "frontend"
deps: ["T89"]
blocks: []
acs: ["AC-35"]
files_hint: ["app/(public)/privacy/privacy-content.tsx", "constants/public-pages-content.ts", "tests/component/privacy-ai-section.test.tsx", "tests/component/privacy-page-ai-section.test.tsx", "tests/e2e/ai-chat-v2-preview-dashboard.spec.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T90 — The privacy and terms pages name Anthropic on paid terms as the model provider (review 2026-10-15 F1-F3)

Follow-up task from the ADR-0014 review of 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md).

## Problem

Since ADR-0014 message text goes to Claude Haiku 5.5 (Anthropic) through the Vercel AI Gateway on paid API terms, but the privacy page section 11 still names Google Gemini and carries the free-tier box (Google may use content, human reviewers). Neither the privacy §5 nor the terms §10 sub-processor table lists the model provider, and privacy §5 says processors only handle technical infrastructure. Three tests pin the old wording.

## Definition of Done

- Privacy section 11 (`app/(public)/privacy/privacy-content.tsx`) names an Anthropic Claude model through the Vercel AI Gateway, on paid API terms under which Anthropic does not use the content to train its models; the free-tier box is removed; 'Who processes your message text' names Anthropic and Vercel. Privacy §5 and terms §10 sub-processor tables (`constants/public-pages-content.ts`) gain a row: Anthropic (via Vercel AI Gateway) — AI assistant — chat message text and the data it reads — USA; the 'only handle the technical infrastructure' sentence is softened to cover the model provider. Tests: `tests/component/privacy-ai-section.test.tsx`, `tests/component/privacy-page-ai-section.test.tsx` (the free-tier case becomes a 'no training on the content' / Anthropic case and asserts Google Gemini and 'free tier' are absent) and `tests/e2e/ai-chat-v2-preview-dashboard.spec.ts:418` assert the new provider. Do not change the page's 'Last updated' date (owner gate). Gate: unit, component, lint, typecheck; the e2e line is updated (e2e runs locally before ship).
- Commit with `SDD-Task: T90`.
