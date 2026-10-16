---
id: T110
title: "ADR-0014, SAD, spec and ship docs record zero data retention and the EU hosting / US model transfer (owner option A)"
layer: "docs"
deps: ["T109"]
blocks: []
acs: []
files_hint: ["docs/features/ai-chat-v2/adr/0014-run-the-chat-on-claude-haiku-5-5-through-the-ai-gateway-on-paid-terms.md", "docs/features/ai-chat-v2/sad.md", "docs/features/ai-chat-v2/spec.md", "docs/features/ai-chat-v2/_ship/pr-body.md", "docs/features/ai-chat-v2/_ship/changelog.md", "docs/features/ai-chat-v2/_ship/security-review-2026-10-14.md"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T110 — ADR-0014, SAD, spec and ship docs record zero data retention and the EU hosting / US model transfer (owner option A)

Owner decision 2026-10-15 (option A): keep Anthropic (US inference only at the Gateway), add zero data retention, and state the real locations: the app runs in the EU (Vercel `fra1`, Neon `eu-central-1` Frankfurt, dev and prod). Closes the location and retention parts of SEC-I-03 ([`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md)).

## Problem

Docs do not record ZDR or where processing happens; pr-body still lists the location/retention checks as open owner items.

## Definition of Done

- ADR-0014 (dated revision): option A — Anthropic endpoint is US-only at the Gateway (live endpoints list read 2026-10-15; EU inference exists only via bedrock eu-central-1 and vertexAnthropic EU, rejected for now: another processor and BYOK setup); zeroDataRetention required; app hosting EU (fra1, Neon eu-central-1). sad §2/§11 and spec §6.1 likewise. pr-body: SEC-I-03 owner items narrowed to confirming the team's ZDR eligibility on preview (one chat message after deploy) and the SCC coverage via Vercel's DPA; list T109–T110. Changelog and the security file ('Resolution' line for SEC-I-03 location/retention → T109/T110). No tests.
- Commit with `SDD-Task: T110`.
