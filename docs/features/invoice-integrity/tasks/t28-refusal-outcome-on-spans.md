---
id: "T28"
title: "Record the outcome of every invoice save and status change on its span so refusals are counted per write path"
layer: "app"
deps: ["T26"]
blocks: ["T27"]
acs: []
files_hint: ["lib/services/invoices/invoices.ts", "tests/unit/services/invoice-save-spans.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T28 — Record the outcome of every invoice save and status change on its span so refusals are counted per write path

## Place in the sequence

- **Blocked by:** T26 — Lock the sender profile (and share-lock line products) before the currency checks on every invoice save · **Blocks:** T27 · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review finding S2: sad §7 Monitoring requires counting lifecycle, locked-field, changed-elsewhere, currency and bounds refusals per path; no code records them, so the friction KPI has no data source.

## Inlined context

> Spans at `invoices.ts:380, 606, 940` carry only `operation`. The repo already sets an outcome attribute this way in `lib/auth/email-provider.ts:299`.
>
> — `_review/review-2026-10-08.md S2, abridged`; sad §7 Monitoring; sad §8 "refusals are counted, not logged".

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: n/a (quality finding; the sad section quoted above is the requirement). AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] Set `outcome` on the active span where each `InvoiceRefusal` / CONFLICT / VALIDATION is returned and on success.
- [ ] Extend `invoice-save-spans.test.ts`.

## Edge cases

| Case | Behaviour |
|---|---|
| generic FAILED | existing failed() path tag unchanged |

## Definition of Done

- [ ] Unit tests show each invoice save / status-change span carries an outcome attribute: ok, or refused:<kind> for lifecycle, locked-field, changed-elsewhere, currency and bounds refusals (one per kind), with only ids and the kind — no form values.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
