---
status: Living
updated_at: "2026-10-09"
---

# Domain Context — editor-ux

<!--
CONTEXT.md is the domain glossary — not a spec and not a scratch pad. NO implementation
detail here (no datastore/broker/framework names, no API contracts) — only domain words
and the boundaries between them. Implementation choices live in the SAD and ADRs; behaviour
lives in spec.md.

Terms get fixed inline, the moment they surface in an interview / spec / review — never
batched «I'll consolidate later». Empty H2 → prune before commit; keep only the sections
that carry real content. ## Glossary is mandatory; the other two are optional.
-->

## Glossary

<!-- One line per term: name · one-sentence canonical definition · one-sentence boundary
     (what it is NOT / the concept it gets confused with). Alphabetical once there are a few. -->
- First display — what a page shows the Freelancer when it first appears, before they interact with it and before it becomes interactive; it must already show the real content and stay the same once interactive. NOT a loading state (a skeleton or spinner in place of the content does not count as a first display of that content).
- Invoice document — the wording, parties, lines, dates and amounts an invoice presents to its Customer, identical in the in-app preview and the PDF. NOT the PDF file or the preview screen (those are two renderings of the one invoice document).
