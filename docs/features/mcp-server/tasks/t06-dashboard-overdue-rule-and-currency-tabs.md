---
id: T06
title: "Apply the shared overdue rule to every dashboard figure and show tabs for issued-invoice currencies"
layer: "app"
deps: ["T02"]
blocks: ["T08", "T14"]
acs: ["AC-23", "AC-23b", "AC-24"]
files_hint: ["lib/services/dashboard/queries.ts", "lib/services/dashboard/dashboard.ts", "tests/integration/services/dashboard/overdue-rule.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T06 — Apply the shared overdue rule to every dashboard figure and show tabs for issued-invoice currencies

## Place in the sequence

- **Blocked by:** T02 — Add the shared overdue rule module with its SQL, Prisma and TypeScript forms · **Blocks:** T08 — Show the derived overdue status on the invoice list, customer page, invoice page and recent invoices, T14 — Page overdue invoices and Debtors strictly with totals over every match · **Wave:** 2 — the Assistant reads (T14, T15) reuse the queries this task changes.
- **Lane:** shares `lib/services/dashboard/queries.ts` with T14 and T15 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** the dashboard and invoice list to treat a past-due unpaid invoice as overdue without my marking it
> **So that** my dashboard and my Assistant agree on who owes me
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my time zone saved on my account and used by the dashboard and by every Assistant
> **So that** "overdue", "today" and "this month" mean the same thing wherever I ask
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task makes the dashboard count overdue by the shared rule, with "today" in the actor's zone, and shows a tab for every currency an Assistant can report.

## Inlined context

> Today the dashboard counts an invoice as overdue only when its stored status is `OVERDUE` (`lib/services/dashboard/queries.ts`), so it would disagree with an Assistant from day one. The dashboard (raw SQL, service-layer ADR-0004), the invoice list and customer page (Prisma queries), the invoice page and the MCP tools must all apply it identically.
>
> — `adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md, Context, abridged` · full text: [ADR-0005](../adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md)

> **Dashboard.** `getSummaryStats`, `getDebtors`, `getExpectedPayments`, `getChartData`, `getRecentInvoices` apply the rule with "today" in the account zone. `getDashboardCurrencyTabs` returns the union of bank-account and issued-invoice currencies (ADR-0008).
>
> — `contracts/server-actions.md §Shared overdue rule, Dashboard, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Chosen:** Option 1 — **Union** — dashboard tabs = currencies of the Freelancer's bank accounts ∪ currencies of their issued invoices. It closes the only known structural parity gap with one extra `DISTINCT` currency query in the dashboard service. The empty-state fallback (a `USD` tab when there is nothing at all) is unchanged.
>
> — `adr/0008-show-dashboard-currency-tabs-for-bank-account-and-issued-invoice-currencies.md, Option 1 + Decision outcome + Neutral, abridged` · full text: [ADR-0008](../adr/0008-show-dashboard-currency-tabs-for-bank-account-and-issued-invoice-currencies.md)

> Flow 13 — `S->>S: today is the current date in the account time zone, never UTC or the server zone`; `S->>D: the same queries the Assistant tools use, with the shared overdue rule`; `D-->>S: the invoice counted as overdue, its Customer a Debtor, left out of Expected payments`.
>
> — `sad.md §6, Flow 13, steps 3–5, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Dashboard figures parity — 100 % of figures equal the dashboard to the cent. Dashboard load after the overdue rule change, p95 — no more than 10 % slower than the 7 days before release.
>
> — `spec.md §6, NFR rows, abridged` · full text: [spec.md](../spec.md)

> **Hard rule:** Dashboard aggregates sum money as `::float8` in raw SQL (`lib/services/dashboard/queries.ts`); a formatting or rounding difference between surfaces would break "to the cent" parity → Assistant tools reuse the same query functions and one formatter.
>
> — `sad.md §11, risk row 2, abridged` · full text: [sad.md](../sad.md)

> Measured on PGlite with 40 Freelancers × 5,000 invoices, the Debtors query with the new overdue rule ran in **12 ms** (bitmap scans on `Invoice_senderProfileId_idx` + `Invoice_status_idx`). No new index.
>
> — `data-model.md §Indexes, Not added, abridged` · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. (Reads `Invoice.status`, `Invoice.dueDate`, `Invoice.currency` with the existing indexes.)

## API contract

Internal — no API surface. Signatures of `getSummaryStats`, `getDebtors`, `getExpectedPayments`, `getChartData`, `getRecentInvoices`, `getCurrencyTabs` are unchanged; their results change meaning per the slice above.

## Acceptance criteria

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

### AC-24 — cross-context

> **Given** a pending invoice whose due date has passed and that the Freelancer never marked overdue
> **When** they open the dashboard and the invoice list
> **Then** the dashboard counts it in the overdue figures, lists its Customer as a Debtor and leaves it out of Expected payments. The invoice list shows it as overdue, includes it when filtered by overdue and leaves it out when filtered by pending, matching what an Assistant reports. Every other place that shows an invoice's status shows it as overdue too, including the dashboard's recent invoices, the customer page and the invoice itself. "Mark as overdue" and "back to pending" are not offered for it. Its stored status is unchanged, and marking it paid works as before
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

(This task owns the dashboard half; the invoice list and other screens are T07/T08.)

## Checklist

- [ ] `lib/services/dashboard/queries.ts` — replace every hand-written `OVERDUE` / pending condition with `overdueSql(today)`; bind `today = todayIn(actor.timeZone, now)`; add the `DISTINCT` issued-invoice currency query.
- [ ] `lib/services/dashboard/dashboard.ts` — pass `today` into every figure; `getRecentInvoices` returns the derived status; `getCurrencyTabs` returns the union (keep the `USD` empty fallback).
- [ ] Remove `queries.ts` from the T02 literal-scan allow-list.
- [ ] `tests/integration/services/dashboard/overdue-rule.test.ts` — AC-24 dashboard half, AC-23/AC-23b instants under a fake clock, currency-tab union; keep `parity.test.ts` green.

## Edge cases

| Case | Behaviour |
|---|---|
| Pending invoice due today in the zone | planned / Expected payments, not overdue |
| Hand-marked overdue invoice not yet due | overdue figures, Debtor (unchanged meaning) |
| Paid invoice past its due date | received only; never overdue |
| Issued invoice in a currency with no bank account | gets its own tab; figures shown there |
| No bank accounts and no invoices | single `USD` tab (unchanged) |

## Definition of Done

- [ ] Integration tests show a past-due never-marked pending invoice counted in overdue figures, its Customer a Debtor, absent from Expected payments and shown Overdue in recent invoices; the AC-23 and AC-23b instants give the same result as the rule module; currency tabs are the union of bank-account and issued-invoice currencies; the existing dashboard parity test stays green.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
