---
id: T102
title: "ADR-0014, SAD, spec and ship docs say what bounds a turn; weekly check reports null costs; owner checks listed (SEC-M-01 d, e; SEC-I-03; SEC-I-05)"
layer: "docs"
deps: ["T101"]
blocks: []
acs: []
files_hint: ["docs/features/ai-chat-v2/adr/0014-run-the-chat-on-claude-haiku-5-5-through-the-ai-gateway-on-paid-terms.md", "docs/features/ai-chat-v2/sad.md", "docs/features/ai-chat-v2/spec.md", "docs/features/ai-chat-v2/_ship/feature.md", "docs/features/ai-chat-v2/_ship/pr-body.md", "docs/features/ai-chat-v2/_ship/changelog.md", "docs/features/ai-chat-v2/_ship/security-review-2026-10-14.md"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

# T102 — ADR-0014, SAD, spec and ship docs say what bounds a turn; weekly check reports null costs; owner checks listed (SEC-M-01 d, e; SEC-I-03; SEC-I-05)

Follow-up task from the ADR-0014 security review addendum, 2026-10-15. Source: [`_ship/security-review-2026-10-14.md`](../_ship/security-review-2026-10-14.md) (Addendum — ADR-0014 model switch). Owner chose: bounds in code + rate limit; AC-11 unchanged.

## Problem

ADR-0014 and sad §11 claim the history cap keeps turns below 100k and allowances cap spend; the weekly p95 check ignores null costs; owner checks from SEC-I-03 and the Gateway spend budget are not listed.

## Definition of Done

- ADR-0014 (dated revision) and sad §11 state the real bounds (T99 output/history/tool caps, T100 10/min limit, AC-11 unchanged, Gateway spend budget as owner backstop) and T101 (disallowPromptTraining, agent default pin). spec §6/§6.1 record the 10 messages/minute refusal (marked added-by security review 2026-10-15) and the bounds. `_ship/feature.md` weekly cost check also reports the null-cost share and total spend incl. FAILED turns, and treats a high null share as a failed check. pr-body owner items: set a spend budget/alert on the Vercel AI Gateway team; verify SEC-I-03 (USA location, SCC coverage of Anthropic via Vercel's DPA, provider-side retention) with the wording approval; the security addendum item is checked with a pointer to the fixes. Changelog lists T99–T102. Security addendum file gets a short 'Resolution' line for SEC-M-01, SEC-L-03, SEC-I-03..05. No tests.
- Commit with `SDD-Task: T102`.
