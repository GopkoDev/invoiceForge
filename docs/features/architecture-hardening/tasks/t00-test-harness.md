---
id: T00
title: "Set up the test harness, throwaway database and factories"
layer: "infra"
deps: []
blocks: ["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10", "T11", "T12", "T13", "T14", "T15", "T16", "T17", "T18", "T19", "T20", "T21", "T22", "T23", "T24", "T25", "T26", "T27", "T28", "T29", "T30", "T31"]
acs: []
files_hint: ["package.json", "docs/features/architecture-hardening/test-plan.md", "docs/features/architecture-hardening/data-model.md", "docs/features/architecture-hardening/migrations/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T00 — Set up the test harness, throwaway database and factories

## Place in the sequence

- **Blocked by:** — · **Blocks:** every other task (T01–T31) · **Wave:** before wave 1.
- **Lane:** own lane. Added 2026-09-27 by `plan-tests` when the owner reversed the spec §3 F7 non-goal.

## Why

The repo has no test harness. `test-plan.md` maps every spec §5 AC to unit, integration, contract, component, e2e and e2e-through-UI tests, and `/sdd:implement` writes them red-first per task. Every later task needs the suites to exist and run.

## Inlined context

> **Integration dependency:** a throwaway Postgres container spun up per suite, with the repo migrations and staged migrations 01–06 applied. **Never** the database in `.env`: it holds the owner's real accounts. No mocked datastore. The AC-07 and AC-22 race tests need real parallel connections, so an in-process single-connection database is not enough.
>
> — `test-plan.md §Test data, verbatim` · full text: [test-plan.md](../test-plan.md)

> **Cleanup boundary:** per-test truncation of every table the feature touches (not a wrapping transaction: the concurrency and deletion tests need committed data on separate connections), and a new container per suite.
>
> — `test-plan.md §Test data, verbatim` · full text: [test-plan.md](../test-plan.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([test-plan.md](../test-plan.md) · [spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md)) and follow it. Do not guess.

## Data delta

No schema changes. The harness applies the repo migrations and then the staged `migrations/01–06` to the throwaway database. For migrations that no task has promoted yet, only the repo migrations are applied, and each task adds its own after promoting it.

## API contract

Internal — no API surface.

## Acceptance criteria

None of its own. It enables every `test-plan.md` row.

## Checklist

- [ ] Pick the unit/component runner and the browser-driven e2e runner that fit the Next.js 16 / React 19 stack, add them as dev dependencies and `test:*` package scripts (unit, integration, e2e) so `implement` detects them
- [ ] Integration setup: start a throwaway Postgres per suite, apply migrations, expose a client, and truncate the feature's tables per test. Refuse to run if the connection string matches `.env`'s `DATABASE_URL`
- [ ] Factories from `test-plan.md §Test data`: Freelancer + session cookie, SenderProfile (unique `invoicePrefix`), BankAccount, Customer, Product, CustomPrice, Invoice + items, a legacy-invoice builder, LogoFetchWindow
- [ ] Test utilities: an injectable clock, a local HTTP image host with the fixtures listed in `test-plan.md`, and an injectable DNS resolver seam for the safe fetcher
- [ ] Contract helper: validate a response against `contracts/openapi.yaml` by `operationId`
- [ ] One smoke test per suite, green
- [ ] CI split per `test-plan.md §CI placement` (there is no CI config yet; add a minimal one, or record the commands in the PR if the owner prefers)
- [ ] Set `.claude/sdd.local.md` `tdd: true` (already set)

## Edge cases

| Case | Behaviour |
|---|---|
| No container runtime on the machine | Integration and e2e suites report "skipped: no container runtime" and never fall back to the `.env` database |
| Staged migration not yet promoted | Not applied. The task that promotes it adds it to the harness |

## Definition of Done

- [ ] unit, component, integration, contract and e2e smoke tests each pass locally
- [ ] the integration suite provably cannot connect to the `.env` database (guard test)
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
