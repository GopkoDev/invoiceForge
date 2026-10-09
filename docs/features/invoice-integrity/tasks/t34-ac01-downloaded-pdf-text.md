---
id: "T34"
title: "Read the text of the downloaded PDF in the AC-01 end-to-end test"
layer: "tests"
deps: []
blocks: []
acs: ["AC-01"]
files_hint: ["tests/e2e/invoice-integrity/us01-issued-details-survive.spec.ts", "tests/e2e/support/", "package.json"]
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

# T34 — Read the text of the downloaded PDF in the AC-01 end-to-end test

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08-r2.md`](../_review/review-2026-10-08-r2.md).

## Why

Review finding N2.

## Inlined context

> N2: `us01-issued-details-survive.spec.ts:70-85` checks only the `%PDF-` header of the download; the text checks run on the HTML preview (a different renderer) and skip the legal name. test-plan.md:34: "the editor and the downloaded PDF still show the old legal name, address and IBAN". The repo has no PDF parser; `tests/support/pdf-text.ts` reads the React element tree, not a file.
>
> — `_review/review-2026-10-08-r2.md N2, abridged`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08-r2.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-01.

## Checklist

- [ ] Add a dev-only PDF text extractor (a small devDependency) behind a helper in `tests/e2e/support/`.
- [ ] Assert old values present and new values absent in the downloaded file; add the legal-name check to the preview.

## Edge cases

| Case | Behaviour |
|---|---|
| text split across runs | normalise whitespace before matching |

## Definition of Done

- [ ] The AC-01 Playwright spec extracts the text of the file downloaded through "Download PDF" and asserts the old legal name, address and IBAN are in it and the new ones are not; the preview check also asserts the old legal name. Passes via pnpm test:e2e.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] lint + vet clean
