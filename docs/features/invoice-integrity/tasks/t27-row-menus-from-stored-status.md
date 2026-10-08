---
id: "T27"
title: "Build row menus from the stored status and the Freelancer's time zone on the list and the dashboard"
layer: "ui"
deps: ["T28"]
blocks: ["T32"]
acs: ["AC-04", "AC-05"]
files_hint: ["lib/services/invoices/invoices.ts", "lib/services/dashboard/dashboard.ts", "types/invoice/types.ts", "components/invoices/invoices-data-table.tsx", "components/dashboard/recent-invoices/dashboard-recent-invoices.tsx", "app/(protected)/dashboard/page.tsx", "components/invoices/invoice-row-actions.tsx", "tests/component/invoice-row-actions-lifecycle.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T27 — Build row menus from the stored status and the Freelancer's time zone on the list and the dashboard

## Place in the sequence

- **Blocked by:** T28 — Record the outcome of every invoice save and status change on its span so refusals are counted per write path · **Blocks:** T32 · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review findings F8 and S4.

## Inlined context

> F8: `invoices-data-table.tsx:190` and `dashboard-recent-invoices.tsx:109` pass `row.original.status`, already derived (`withDerivedStatus` `invoices.ts:294`, `derivedStatus` `dashboard.ts:194`); `invoice-row-actions.tsx:259` runs `allowedTargets` on it, so a past-due stored-PENDING row loses "Mark as Overdue".
> S4: `dashboard-recent-invoices.tsx:107-111` passes no `timeZone`, so `todayInZone(undefined)` uses the browser's zone; the value is available at `app/(protected)/dashboard/page.tsx:100`.
>
> — `_review/review-2026-10-08.md F8, S4, abridged`

> default — row actions by status … a past-due pending row reads Overdue but offers the pending moves
>
> — `screens.md SCR-01, abridged`; T15 edge-case table `tasks/t15-list-row-actions-and-cancel.md:136`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-04, AC-05. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] Add `storedStatus` to the list and dashboard row DTO; keep the derived status for the badge.
- [ ] Pass it and the time zone into `InvoiceRowActions`.
- [ ] Tests per DoD.

## Edge cases

| Case | Behaviour |
|---|---|
| stored OVERDUE row, due date today or later | Mark as Pending offered (unchanged) |
| dashboard, browser zone ≠ Freelancer zone | Freelancer zone wins |

## Definition of Done

- [ ] A component test shows a stored-PENDING invoice past its due date reads Overdue but offers Mark as Overdue, Mark as Paid and Cancel (the stored-pending moves); the list and dashboard row DTOs carry the stored status alongside the derived one; the dashboard passes the Freelancer's time zone to InvoiceRowActions and a test shows "today" is resolved in that zone.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
