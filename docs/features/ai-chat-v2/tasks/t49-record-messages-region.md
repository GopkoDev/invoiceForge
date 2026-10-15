---
id: T49
title: "Record the scroll area's labelled region and Tab stop in screens.md, the NOTICE and the element header (review R18-1)"
layer: "docs"
deps: ["T47"]
blocks: []
acs: ["AC-16"]
files_hint: ["docs/features/ai-chat-v2/screens.md", "components/ai-elements/NOTICE", "components/ai-elements/conversation.tsx"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T49 — Record the scroll area's labelled region and Tab stop in screens.md, the NOTICE and the element header (review R18-1)

Follow-up task from review 2026-10-13, round 18. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

T47 made the conversation scroll area a labelled region (`role="region"`, `aria-label` "Messages") and a Tab stop with a focus ring. Only design-system.md records this. The SCR-03 manifest, the Apache NOTICE and the element's header do not.

## Definition of Done

- screens.md SCR-03 says the scroll area is a Tab stop (tabIndex 0, role region, aria-label Messages) with an inset focus-visible ring and that a keyboard Jump to latest moves focus to it; components/ai-elements/NOTICE and the conversation.tsx header record the labelled region and Tab stop as the replacement for role=log.
- Docs only, with no behaviour change, so there is no RED test. Gate: unit (only the 8 known env.example failures), lint and typecheck green. Commit with `SDD-Task: T49`.
