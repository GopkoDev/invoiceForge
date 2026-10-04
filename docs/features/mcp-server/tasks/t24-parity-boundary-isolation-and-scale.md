---
id: T24
title: "Prove Assistant-dashboard parity, day boundaries, tenant isolation and the latency budget end to end"
layer: "tests"
deps: ["T18", "T19"]
blocks: []
acs: ["AC-08", "AC-15", "AC-23", "AC-23b"]
files_hint: ["tests/integration/api/mcp-parity.test.ts", "tests/integration/api/mcp-day-boundary.test.ts", "tests/integration/api/mcp-isolation.test.ts", "tests/integration/api/mcp-scale.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T24 — Prove Assistant-dashboard parity, day boundaries, tenant isolation and the latency budget end to end

## Place in the sequence

- **Blocked by:** T18 — Expose the overdue, Debtors, Expected payments and summary figures tools · T19 — Expose the customers, invoice search and one-invoice tools · **Blocks:** — · **Wave:** 7 — the closing acceptance suite over every tool.
- **Lane:** own lane (new test files only).

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** per-currency summary figures for a Dashboard period, computed by invoiceFlow
> **So that** the numbers I quote match the Freelancer's dashboard exactly
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my time zone saved on my account and used by the dashboard and by every Assistant
> **So that** "overdue", "today" and "this month" mean the same thing wherever I ask
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my data readable only through a valid, unrevoked Personal key of mine, at a bounded rate, and never changeable through it
> **So that** a leaked, revoked or guessed key, or another Freelancer's key, cannot expose or alter my data
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task proves the central promise — "an Assistant's numbers always match the dashboard" — and the isolation and latency targets through the real `/api/mcp` endpoint.

## Inlined context

> | Latency p95, list and single-record questions (≤ 50 rows) | ≤ 800 ms server-side | request spans in error tracking, 7-day window after release |
> | Latency p95, summary figures, Debtors and Expected payments, for a Freelancer with 5,000 invoices | ≤ 1.5 s server-side | integration test on a seeded fixture + spans in error tracking |
> | Dashboard figures parity | 100 % of figures equal the dashboard to the cent | automated parity test over a seeded multi-currency fixture, run in CI; spot check in the ship stage |
>
> — `spec.md §6, NFR rows 1–3, verbatim` · full text: [spec.md](../spec.md)

> **How verify:** "automated parity test over a seeded multi-currency fixture, run in CI; spot check in the ship stage" — the test calls each tool and the matching dashboard function for the same `ActingFreelancer` and compares every figure; the boundary cases run under a fake clock …
>
> — `sad.md §10, QG-1, abridged` · full text: [sad.md](../sad.md)

> Dashboard aggregates sum money as `::float8` in raw SQL (`lib/services/dashboard/queries.ts`); a formatting or rounding difference between surfaces would break "to the cent" parity | Medium | Assistant tools reuse the same query functions and one formatter; the CI parity test compares formatted values; move sums to `numeric` at `data-model` if the test finds drift
>
> — `sad.md §11, risk row 2, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1 [Union — dashboard tabs = currencies of the Freelancer's bank accounts ∪ currencies of their issued invoices]. It closes the only known structural parity gap … so the parity test can run over every currency without exclusions.
>
> — `adr/0008, Decision outcome, abridged` · full text: [adr/0008](../adr/0008-show-dashboard-currency-tabs-for-bank-account-and-issued-invoice-currencies.md)

> Measured on PGlite with 40 Freelancers × 5,000 invoices (200,000 rows), the Debtors query with the new overdue rule ran in **12 ms** … Revisit only if dashboard or aggregate spans breach their budgets.
>
> — `data-model.md §Indexes, Not added, abridged` · full text: [data-model.md](../data-model.md)

> Fixtures: the AC-23 / AC-23b fixtures use `Europe/Kyiv` and `America/New_York`. `createPersonalKey(prisma, overrides)` … returns `{ row, fullKey }`, so tests can call `/api/mcp` with it. PII guard: users stay `user-<n>@example.test`.
>
> — `data-model.md §Test fixtures, abridged` · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Every call is `POST /api/mcp` with `Authorization: Bearer <fullKey>`, `Accept: application/json, text/event-stream`, one JSON-RPC `tools/call` for each of the seven tools in `x-mcp-tools`.
- Compared fields: `CurrencyTotal{currency, total, count}`, `CurrencySummary{received, planned, overdue, allFuturePayments}`, `Debtor{rank, overdueTotal, overdueCount}`, `today`, `timeZone`, `AppliedPeriod`; `DecimalString` `^-?\d+\.\d{2}$`.
- Cross-tenant: `NOT_FOUND` tool errors must be byte-identical to those for unknown references.

— `contracts/openapi.yaml, postMcpMessage + schemas, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-08 — authorization

> **Given** an Assistant acting with Freelancer A's key, and an invoice or customer that belongs to Freelancer B
> **When** it asks for that record by its reference: an invoice number (optionally with a sender profile name), a customer name, or a record identifier of the kind earlier answers return
> **Then** the system answers exactly as it would for a reference that does not exist, so B's record is never revealed, not even its existence
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-15 — happy path

> **Given** a Freelancer and any Dashboard period
> **When** an Assistant asks for the summary figures for that period
> **Then** every figure equals, to the cent, what the dashboard's summary shows for the same period and time zone. There are exactly four figures, each a total and a count, and each states which date it is counted by:
> - received: paid invoices, counted by issue date within the period, as on the dashboard;
> - planned: pending invoices that are not overdue, counted by due date within the period;
> - overdue: overdue invoices, counted by due date within the period;
> - all future payments: pending and overdue invoices, whatever the period.
>
> They are reported per currency, for every currency that appears on the Freelancer's issued invoices, and never converted. Breakdowns by sender profile or bank account and the dashboard chart are not part of the answer
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — cross-context

> **Given** a Freelancer in the Kyiv time zone, at 00:30 on the first day of a month in Kyiv while it is still the previous day in UTC, and a pending invoice due on the last day of the previous month
> **When** the Freelancer opens the dashboard and an Assistant asks about "this month" and overdue invoices
> **Then** both use the new month, and both count that invoice as overdue
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

### AC-23b — cross-context

> **Given** a Freelancer in the New York time zone, at 21:00 on 14 March in New York while it is already 15 March in UTC, and a pending invoice due on 14 March
> **When** the Freelancer opens the dashboard and an Assistant asks for overdue invoices
> **Then** neither counts that invoice as overdue, because today in the Freelancer time zone is still 14 March. From 00:00 on 15 March in New York both count it, with 1 day overdue
>
> — `spec.md §5, AC-23b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `tests/integration/api/mcp-parity.test.ts` — seeded multi-currency fixture (incl. a currency with no bank account); for every preset and one custom range compare `get_summary_figures`, `list_expected_payments`, `list_overdue_invoices` and `list_debtors` totals with `getSummaryStats`, `getExpectedPayments`, `getDebtors` for the same `ActingFreelancer`, as formatted strings.
- [ ] `tests/integration/api/mcp-day-boundary.test.ts` — fake clock at the AC-23 and AC-23b instants; dashboard functions and tools agree on period bounds, overdue membership and `daysOverdue`.
- [ ] `tests/integration/api/mcp-isolation.test.ts` — two Freelancers; A's key probes every tool with B's ids, invoice numbers (with and without sender profile name) and Customer names; responses equal those for random unknown references.
- [ ] `tests/integration/api/mcp-scale.test.ts` — 5,000-invoice Freelancer; measure server-side time per tool (aggregates ≤ 1.5 s, lists ≤ 800 ms; take p95 over repeated calls).

## Edge cases

| Case | Behaviour |
|---|---|
| Float rounding in raw-SQL sums | strings compared; any mismatch fails the test (and triggers the §11 `numeric` mitigation) |
| Invoice currency with no bank account | present on both the dashboard tabs and the tool answer |
| No time zone saved | both surfaces use UTC; tools answer `timeZone: "UTC"` |
| B's record id with A's key | identical `NOT_FOUND` to an unknown id, for every tool |
| Debtors beyond the dashboard's top entries | ranks agree for the entries the dashboard shows |
| CI runner slower than prod | scale test asserts the spec budget only; spans in Sentry remain the production measure |

## Definition of Done

- [ ] CI integration tests show every tool figure equals the dashboard to the cent over a seeded multi-currency fixture, the AC-23 and AC-23b instants agree between dashboard and tools under a fake clock, Freelancer A's key never reveals any of Freelancer B's records through any tool, and the aggregates stay within 1.5 s and lists within 800 ms for a 5,000-invoice Freelancer.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
