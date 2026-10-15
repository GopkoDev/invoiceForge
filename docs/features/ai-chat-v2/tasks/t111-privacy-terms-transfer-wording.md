---
id: T111
title: "Privacy and terms describe where processing happens without overclaiming; Sentry is listed (review Z-1..Z-6)"
layer: "frontend"
deps: ["T110"]
blocks: []
acs: ["AC-35"]
files_hint: ["app/(public)/privacy/privacy-content.tsx", "constants/public-pages-content.ts", "tests/component/public-pages-ai-subprocessor.test.ts", "tests/component/privacy-ai-section.test.tsx", "docs/features/ai-chat-v2/adr/0014-run-the-chat-on-claude-haiku-5-5-through-the-ai-gateway-on-paid-terms.md", "docs/features/ai-chat-v2/sad.md"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T111 — Privacy and terms describe where processing happens without overclaiming; Sentry is listed (review Z-1..Z-6)

Follow-up task from the review of T109–T110, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Review of T109–T110). Orchestrator decision on Z-1: option (a), reword; no US-zone pin.

## Definition of Done

- Privacy §11 (app/(public)/privacy/privacy-content.tsx): Anthropic is a US company and processes the message text outside the EU, mainly in the USA; it does not store the text after answering (zero data retention under its agreement with Vercel), except where the law requires it. Privacy §5 and terms §10 (constants/public-pages-content.ts): Vercel location 'EU (Frankfurt, fra1) for the app; AI Gateway and CDN are global'; Neon stays 'EU (Frankfurt, eu-central-1)'; the transfer sentence (one string, no unescaped double quotes) says: hosting and database run in the EU; Vercel and Neon are US companies whose DPAs include Standard Contractual Clauses (SCCs) for any access from outside the EU; Anthropic processes data in the USA under Vercel's Data Processing Agreement (SCCs); the sign-in providers (Google, GitHub) process data in the USA under their own SCCs or EU-US Data Privacy Framework certification. Remove or complete the dangling 'All providers listed above are covered.' (if a T94 test requires the phrase, extend it to '…are covered by data processing agreements' and keep the test passing without weakening it). Add a Sentry row to both tables: error monitoring, error reports and metadata-only performance spans, location 'EU (Germany)'. ADR-0014 option A revision and sad.md:60: 'Anthropic, a US company; the anthropic endpoint offers no EU region; processing is outside the EU, mainly in the USA' (no claim that inference stays in the US; the +10 % US-zone pin was considered and not taken). Tests (component): §11 matches /outside the EU/ and /zero data retention/ and not /keeps no copy/; Vercel row matches /AI Gateway/ and /global/; transfer sentence matches /Vercel and Neon/ and /Data Privacy Framework|own SCCs/; Sentry row present with /EU/. Don't change Last updated. Scoped gate: related component tests, tsc, eslint. Security file: Resolution line Z-1..Z-6 → T111.
- Commit with `SDD-Task: T111`.
