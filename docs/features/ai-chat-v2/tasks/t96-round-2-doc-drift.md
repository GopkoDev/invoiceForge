---
id: T96
title: "Docs after round 2: closed risks, terms note, weekly cost check, provider pin and the missing security addendum (review round 2 N2, N4)"
layer: "docs"
deps: ["T94", "T95"]
blocks: []
acs: ["AC-35"]
files_hint: ["docs/features/ai-chat-v2/sad.md", "docs/features/ai-chat-v2/spec.md", "docs/architecture-map.md", "docs/features/ai-chat-v2/adr/0014-run-the-chat-on-claude-haiku-5-5-through-the-ai-gateway-on-paid-terms.md", "docs/features/ai-chat-v2/_ship/pr-body.md", "docs/features/ai-chat-v2/_ship/changelog.md"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T96 — Docs after round 2: closed risks, terms note, weekly cost check, provider pin and the missing security addendum (review round 2 N2, N4)

Follow-up task from round 2 of the ADR-0014 review, 2026-10-15. Source: [`_review/review-2026-10-15-adr-0014.md`](../_review/review-2026-10-15-adr-0014.md) (Round 2).

## Problem

sad.md:1071 still lists the privacy §11 Gemini risk as open; spec.md:684 says the terms sub-processor gap is left open; spec.md:655 repeats one sentence; architecture-map.md:201 and sad.md:1069 call the weekly p95 cost check an 'alert'; ADR-0014 does not record the provider pin; pr-body presents the 2026-10-14 security review as current.

## Definition of Done

- sad.md:1071 marked closed by T90; spec.md:684 notes T90 added the Anthropic row to terms §10; the duplicate sentence in spec.md:655 removed; 'alert' → 'weekly p95 cost check' in architecture-map.md:201 and sad.md:1069; ADR-0014 consequences record the Gateway provider pin (T94: only Anthropic, no cross-provider fallback; a provider outage now surfaces as 'AI temporarily unavailable') and T95; pr-body gains an unchecked owner/ship item 'Security review addendum for ADR-0014 (spec §6.1)' and no longer implies the 2026-10-14 review covers the switch; changelog lists T94–T96. No tests (docs only).
- Commit with `SDD-Task: T96`.
