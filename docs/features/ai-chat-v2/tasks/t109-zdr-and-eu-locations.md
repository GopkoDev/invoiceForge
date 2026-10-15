---
id: T109
title: "Gateway calls require zero data retention; privacy and terms name the EU hosting and the US model transfer (SEC-I-03, owner option A)"
layer: "backend"
deps: ["T108"]
blocks: []
acs: ["AC-35"]
files_hint: ["lib/ai/gateway-options.ts", "constants/public-pages-content.ts", "app/(public)/privacy/privacy-content.tsx", "tests/unit/lib/ai/gateway-only-anthropic.test.ts", "tests/component/public-pages-ai-subprocessor.test.ts"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "todo"
---

# T109 — Gateway calls require zero data retention; privacy and terms name the EU hosting and the US model transfer (SEC-I-03, owner option A)

Owner decision 2026-10-15 (option A): keep Anthropic (US inference only at the Gateway), add zero data retention, and state the real locations: the app runs in the EU (Vercel `fra1`, Neon `eu-central-1` Frankfurt, dev and prod). Closes the location and retention parts of SEC-I-03 ([`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md)).

## Problem

The Gateway pin does not require zero data retention, so provider-side retention is unproven. Privacy §5 and terms §10 list Vercel as 'USA (with EU edge caching)' and Neon as 'USA', but the app runs in Vercel fra1 and Neon eu-central-1 (Frankfurt); the Anthropic endpoint at the Gateway serves Haiku 5.5 only from the US.

## Definition of Done

- `GATEWAY_PROVIDER_OPTIONS.gateway.zeroDataRetention = true` (lib/ai/gateway-options.ts, comment: the anthropic endpoint reports has_zdr; a team without ZDR eligibility fails closed); tests/unit/lib/ai/gateway-only-anthropic.test.ts and agent-gateway-defaults/studio tests expect it at the router, agent stream and defaults. Privacy §5 and terms §10 (constants/public-pages-content.ts): Vercel location 'EU (Frankfurt, fra1)'; Neon location 'EU (Frankfurt, eu-central-1)'; Anthropic row stays 'USA' and says 'zero data retention'; the transfer sentence names the US transfer for Anthropic and the OAuth providers under SCCs (keep Vercel's DPA wording). Privacy §11 says the model provider keeps no copy of the message text (zero data retention) and that processing happens in the USA. Component tests (public-pages-ai-subprocessor, privacy-ai-section, privacy-page-ai-section) assert the EU locations, 'USA' for Anthropic, and the zero-retention statement; any e2e text assertion affected is updated. Do not change the 'Last updated' date. Scoped gate: related unit/component tests, tsc, eslint.
- Commit with `SDD-Task: T109`.
