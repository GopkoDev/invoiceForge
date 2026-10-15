---
id: T112
title: "Privacy and terms tables match §11 for Anthropic and disclose what Sentry receives (review W-1..W-4)"
layer: "frontend"
deps: ["T111"]
blocks: []
acs: ["AC-35"]
files_hint: ["constants/public-pages-content.ts", "tests/component/public-pages-ai-subprocessor.test.ts", "instrumentation-client.ts", "docs/features/ai-chat-v2/sad.md"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T112 — Privacy and terms tables match §11 for Anthropic and disclose what Sentry receives (review W-1..W-4)

Follow-up task from the review of T111, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Review of T111). Sentry behaviour is unchanged; the pages disclose it.

## Definition of Done

- constants/public-pages-content.ts, privacy §5 and terms §10: Anthropic row location 'Outside the EU (mainly USA)' (still mentions zero data retention); transfer sentence says 'Vercel, Neon and Sentry are US companies whose Data Processing Agreements include Standard Contractual Clauses (SCCs) for any access from outside the EU' and 'Anthropic, a US company, processes data outside the EU, mainly in the USA, under Vercel's Data Processing Agreement (SCCs)'; sign-in providers sentence unchanged; Sentry rows' data 'Error reports, session replays recorded when an error occurs (text masked), logs and metadata-only performance spans' (verify masking in instrumentation-client.ts: if replay text is not masked, say so accurately instead). tests/component/public-pages-ai-subprocessor.test.ts: the Anthropic row location matches /Outside the EU/ and /USA/; neither content object contains a USA-only claim for Anthropic (/Anthropic processes data in the USA/); the transfer sentence matches /Vercel, Neon and Sentry/ (update the T111 /Vercel and Neon/ assertion accordingly — it is being replaced by a stricter one); Sentry row data matches /replay/i and /logs/i. docs/features/ai-chat-v2/sad.md:60 stray parenthesis fixed. Security file: 'Resolution (review of T111): W-1..W-4 → T112.' Don't change Last updated. Scoped gate: the component tests + vitest related on the constants file, tsc, eslint.
- Commit with `SDD-Task: T112`.
