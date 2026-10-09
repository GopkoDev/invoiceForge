---
id: "T32"
title: "Drive the invoice-integrity flows end to end through the UI"
layer: "tests"
deps: ["T22", "T23", "T27"]
blocks: []
acs: ["AC-01", "AC-02", "AC-04", "AC-06", "AC-07", "AC-10", "AC-23"]
files_hint: ["tests/e2e/invoice-integrity/", "tests/e2e/support/seed.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T32 — Drive the invoice-integrity flows end to end through the UI

## Place in the sequence

- **Blocked by:** T22 — Refresh the issued details in the editor after Save and issue and never offer a picker on an issued invoice, T23 — Apply the amount bounds by status and path: shape only on issued saves, every bound on draft saves and on issuing from the list, discount capped at the column limit, T27 — Build row menus from the stored status and the Freelancer's time zone on the list and the dashboard · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review finding F9: none of the owner-confirmed e2e-through-UI rows were written and no task covered them.

## Inlined context

> Rows: `docs/features/invoice-integrity/test-plan.md:24, 34, 38, 45, 53, 55, 67, 104`. Read each row there — it is the contract for this task.
>
> — `_review/review-2026-10-08.md F9`

Harness: `playwright.config.ts` starts `tests/e2e/support/start-app-server.mjs` (production build against a throwaway Postgres container; see its no-docker fallback). Follow existing specs (`tests/e2e/mcp-*.spec.ts`) and helpers `tests/e2e/support/{seed,signed-in,genuine-session,require-container-runtime}.ts`. Never touch the `.env` database.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-01, AC-02, AC-04, AC-06, AC-07, AC-10, AC-23. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] One spec file per user story under `tests/e2e/invoice-integrity/`.
- [ ] Seed through the existing seed helper; sign in through the existing helper.
- [ ] Run with `pnpm test:e2e tests/e2e/invoice-integrity`.

## Edge cases

| Case | Behaviour |
|---|---|
| no container runtime | specs skip via require-container-runtime, recorded NON-red |

## Definition of Done

- [ ] Playwright specs against the real app server on a throwaway container cover every e2e-through-UI row of test-plan.md for AC-01, AC-02, AC-04, AC-06, AC-07, AC-10 and AC-23 (incl. AC-02: save the draft, Save and issue, then change the Customer — editor and PDF keep the issued details; AC-07: move the due date of an overdue invoice and the list no longer shows it overdue; AC-10: a stale editor save after a status change elsewhere opens the changed-elsewhere dialog; AC-23: a direct link to another Freelancer's invoice renders the not-found screen) and pass via pnpm test:e2e.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
