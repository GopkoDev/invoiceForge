---
id: T5
title: "Wrap the current dashboard actions in dashboard.<section> Sentry spans to start the latency baseline"
layer: "wiring"
deps: []                # task ids that must finish first
blocks: ["T17"]         # task ids waiting on this one — the inverse of `deps` (markdown only)
acs: []                 # no spec §5 AC; serves the spec §6 NFR "Dashboard load latency p95"
files_hint: ["lib/actions/dashboard-actions.ts", "tests/unit/lib/actions/dashboard-spans.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"           # S/M/L or hours — how long the work takes
context_budget: "S"     # what the task costs the executing agent to hold (markdown only).
                        # Measured, not guessed: the non-empty lines from `## Why (user story)`
                        # through `## Acceptance criteria`.
                        # S = ≤40 inlined lines, ≤1 extra file to open
                        # M = ≤120 inlined lines, 2–4 files in play
                        # L = beyond that — split the task, or keep it and say why right here:
                        #     context_budget: "L"   # justified: <one line>
status: "todo"
---

<!-- The governing rule of this file: **inline the slice the task actually needs, name where it came
from, and keep the link as the fallback for when the slice turns out not to be enough.** A task is
self-contained: it carries its own context instead of sending the executing agent off to reconstruct it.

Every inlined chunk ends with a one-line **provenance signature**:
`<file> §<section>, <identifier>, verbatim|abridged` — e.g. `spec.md §5, AC-02, verbatim`,
`data-model.md §Entities, table order, abridged`. Never «see the spec».

**Inline budget.** Exactly what THIS task needs: only its own acceptance criteria, only the
data-model fields and endpoints it touches. Cut a long chunk to the essential, mark it `abridged`,
and link the full text. `context_budget` in the frontmatter carries the measured number, and an `L`
either gets split or gets its `# justified:` reason on that line — the `tasks` skill checks both.

**Divergence risk.** An inline is a snapshot taken at breakdown time; upstream can move after it.
The source always wins — which is exactly why every chunk carries a signature pointing at where the
truth lives.

**To the executing agent:** work from what is inlined here. If a slice is insufficient, ambiguous,
or contradicts the code in front of you, open the named file for the full text and follow that.
Do not invent the missing part. -->

# T5 — Wrap the current dashboard actions in dashboard.<section> Sentry spans to start the latency baseline

## Place in the sequence

- **Blocked by:** — · **Blocks:** T17 — Build the dashboard SQL for currency tabs, summary stats and the chart (the new queries reuse the same span names) · **Wave:** 1, a DAG root that can start immediately. It ships in release wave 1, so that ≥ 7 days of baseline accumulate before the dashboard cut-over in release wave 4.
- **Lane:** shares `lib/actions/dashboard-actions.ts` with T19. They are serialized, and T5 lands long before T19.

## Why (user story)

> **As a** Freelancer
> **I want** my dashboard figures (revenue, the chart, sender accounts, Debtors and Expected payments) to match today's to the cent and to appear in a stable order
> **So that** I can rely on them as my invoice history grows
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task makes today's dashboard latency measurable per section, so the SQL rewrite can be judged against a real "before".

## Inlined context

> - Latency: Sentry performance traces (10% sample in production) give the dashboard p95 per section. Each dashboard section runs inside a named Sentry span (`dashboard.<section>`), added around the old actions in wave 1 and kept around the new queries in wave 4. The before/after 7-day windows (spec §6, §7) therefore compare the same span. At least 7 days of baseline accumulate before wave 4 ships.
>
> — `sad.md §7, Monitoring, Latency, verbatim` · full text: [sad.md](../sad.md)

**Repo today:** `lib/actions/dashboard-actions.ts` exports `getDashboardCurrencyTabs`, `getDashboardSummaryStats`, `getDashboardChartData`, `getDashboardSenderAccounts`, `getDashboardRecentInvoices`, `getDashboardDebtors` and `getDashboardExpectedPayments`. It imports nothing from `@sentry/nextjs` yet. Sentry 10 runs in production only, with a 10% trace sample (`sentry.server.config.ts:74`).

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. The seven action signatures and return values stay exactly as today.

## Acceptance criteria

No spec §5 AC. The task serves this spec §6 NFR row:

### NFR — Dashboard load latency p95

> | Dashboard load latency p95 | ≤ today's baseline (no regression); target reduction TBD (see §8) | production performance traces, 7-day window before vs after |
>
> — `spec.md §6, row "Dashboard load latency p95", verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: `tests/unit/lib/actions/dashboard-spans.test.ts`. Mock `@sentry/nextjs` `startSpan` and assert that each of the seven actions calls it once, with `name: 'dashboard.<section>'`, and returns the inner result unchanged.
- [ ] In `lib/actions/dashboard-actions.ts`, wrap each action body in `Sentry.startSpan({ name: 'dashboard.<section>', op: 'function' }, async () => …)`. Use the section names `currency-tabs`, `summary-stats`, `chart`, `sender-accounts`, `recent-invoices`, `debtors` and `expected-payments`.
- [ ] Put the span inside `unstable_cache` for currency tabs, or around it, whichever keeps the cached value identical. Note the choice in a comment, because T19 keeps the same span name.
- [ ] Record the span names in a short comment block at the top of the file. T17, T18 and T19 reuse them verbatim.
- [ ] Run `pnpm test:unit` and the existing dashboard tests. They must pass with 0 changed expectations.

## Edge cases

| Case | Behaviour |
|---|---|
| Sentry disabled (dev, test) | `startSpan` is a no-op pass-through, and the outputs are unchanged |
| An action throws or returns `FAILED` | the span ends. The error is still reported exactly once by `failed()`, never also by the span |
| A cached currency-tabs hit | no DB work. The span still records the (short) duration consistently with how T19 will record it |

## Definition of Done

- [ ] The span unit test passes for all seven actions.
- [ ] The existing dashboard unit, integration and component tests pass unchanged.
- [ ] After deploy, the `dashboard.<section>` spans are visible in Sentry performance (checked once in production).
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
