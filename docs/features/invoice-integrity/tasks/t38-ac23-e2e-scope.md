---
id: "T38"
title: "Scope the AC-23 not-found comparison to the main region"
layer: "tests"
deps: []
blocks: []
acs: ["AC-23"]
files_hint: ["tests/e2e/invoice-integrity/us11-foreign-invoice-not-found.spec.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
source: "review-2026-10-08-r2"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T38 — Scope the AC-23 not-found comparison to the main region

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08-r2.md`](../_review/review-2026-10-08-r2.md).

## Why

Review finding L3.

## Inlined context

> L3: `page.locator('main, body').first()` always resolves to `<body>`, so the equality check covers layout chrome and toasts.
>
> — `_review/review-2026-10-08-r2.md L3, abridged`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08-r2.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-23.

## Checklist

- [ ] Use `page.getByRole('main')` (check the layout renders a main landmark).

## Edge cases

| Case | Behaviour |
|---|---|
| — | — |

## Definition of Done

- [ ] us11-foreign-invoice-not-found.spec.ts compares and searches the text of `main` (the not-found screen), not the whole body. Passes via pnpm test:e2e.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] lint + vet clean
