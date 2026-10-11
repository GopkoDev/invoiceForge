---
id: T05
title: "Name the AI model provider, the gateway and the chat retention on the public Privacy page"
layer: "docs"
deps: []
blocks: []
acs: []
files_hint: ["app/(public)/privacy/page.tsx", "tests/component/privacy-page-ai-section.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T05 — Name the AI model provider, the gateway and the chat retention on the public Privacy page

## Place in the sequence

- **Blocked by:** nothing — starts in wave 1 · **Blocks:** nothing — a leaf of the graph · **Wave:** 1 — copy only; spec §8 and sad §11 make it a ship blocker, so it starts early.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to delete one or all of my Conversations, and to know they are deleted automatically after 90 days
> **So that** my customers' names and amounts do not pile up in a chat history forever
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

This task tells Freelancers plainly where their chat text goes and how long it is kept, before the feature ships.

## Inlined context

> - **Message text sent to an external model provider** to produce replies. This is a new processor of Freelancer and Customer data, and the Privacy page must name it before release (§8).
> - **Conversations** (message text, including Customer names and amounts quoted in replies). Kept until 90 days after the last message, deletable by the Freelancer, included in the data export, removed with the account.
> - **Debugging traces with metadata only:** tools called, step count, duration, cost and outcome. No message text and no tool answers.
>
> — `spec.md §6.1, Personal data touched, abridged` · full text: [spec.md](../spec.md)

> **Free-tier key vs the spec's privacy promise.** Under the free tier's terms, Google may use chat content, including Customer names and amounts, to improve its products, and human reviewers may read it. This contradicts spec §6.1 (Confidential) and §8 ("no training on the data") — ADR-0003, §1 override. | High | Before `sdd:ship`, either update spec §6.1 / §8 and the Privacy page to say so plainly, or move the key to paid terms (one setting change); `/security-review` checks which one happened.
>
> — `sad.md §11, risk row 1, abridged` · full text: [sad.md](../sad.md)

> **Spec §8 carried over: Privacy page wording** for the external processors (Vercel gateway, Google), retention and training. | High | New Privacy section before `sdd:ship`, consistent with the first row's outcome.
>
> — `sad.md §11, risk row 12, abridged` · full text: [sad.md](../sad.md)

**Decision boundary:** this task writes the copy for the setting that is decided today (ADR-0003: free-tier key). If the owner moves the key to paid terms before ship, the "may be used to improve" sentence is replaced by the paid terms' no-training statement — that change belongs to the owner's decision, not to this task. Updating spec §6.1 / §8 is a spec edit by the owner, outside this task.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [ADR-0003](../adr/0003-run-a-gemini-model-through-the-ai-sdk-and-the-vercel-ai-gateway-on-a-free-tier-key.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

No spec §5 AC; the requirement is spec §6.1 and §8:

> - [ ] How does the Privacy page describe the external model provider (category, retention, no training on the data)? Default now: a new section added as part of this feature, naming the provider once `design` picks it. — owner: Dmytro Hopko, due: before `sdd:ship`
>
> — `spec.md §8, open question 4, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add an "AI assistant" section: what is sent (message text and the data the answer needs), to whom (Vercel AI Gateway, Google Gemini), under which terms (ADR-0003 free tier, stated plainly), retention (Conversations 90 days after the last message, deletable, in the export, removed with the account), traces metadata only — `app/(public)/privacy/page.tsx`
- [ ] Component test that the section renders and names both processors — `tests/component/privacy-page-ai-section.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Key moved to paid terms before ship | owner swaps the training sentence; flagged in the ship checklist |
| Copy mentions an MCP client's own provider | out of scope — external Assistants are the Freelancer's own processors |

## Definition of Done

- [ ] The public Privacy page has a section that names the Vercel AI Gateway and Google as processors of chat text, states the free-tier terms (content may be used to improve Google's products and read by reviewers) exactly as ADR-0003 records them, the 90-day Conversation retention and the metadata-only traces, and a component test asserts the section renders.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
