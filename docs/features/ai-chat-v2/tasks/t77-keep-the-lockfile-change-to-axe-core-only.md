---
id: T77
title: "Keep the axe-core lockfile change to axe-core only: restore next's @babel/core 7.29.7 peer resolution (review R21-3)"
layer: "infra"
deps: ["T74"]
blocks: []
acs: []
files_hint: ["pnpm-lock.yaml", "package.json"]
owner: "Dmytro Hopko"
estimate: "XS"
context_budget: "S"
status: "done"
---

# T77 — Keep the axe-core lockfile change to axe-core only: restore next's @babel/core 7.29.7 peer resolution (review R21-3)

Follow-up task from review 2026-10-13, round 21. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

`pnpm add -D axe-core` in T74 (9153e32) re-resolved peers beyond axe-core: next and the packages that peer on it now resolve the optional peer @babel/core to 8.0.7 instead of 7.29.7, and eslint's axe-core 4.11.0 moved to 4.13.0.

## Definition of Done

- pnpm-lock.yaml differs from its pre-T74 state (7d1e185) only by the axe-core 4.13.0 devDependency importer entry and the package entries it needs; next resolves @babel/core 7.29.7 again (e.g. restore the old lock and run a plain `pnpm install` with the package.json entry, which keeps locked resolutions).
- `pnpm install --frozen-lockfile` succeeds. No test change (infra only, no RED). Gate: unit (incl. the axe component test), lint, typecheck, and `next build` via the affected e2e run.
- Commit with `SDD-Task: T77`.
