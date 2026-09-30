---
id: T18
title: "Build the dashboard SQL for sender accounts, recent invoices, Debtors and Expected payments"
layer: "app"
deps: ["T17"]           # task ids that must finish first
blocks: ["T19"]         # task ids waiting on this one — the inverse of `deps` (markdown only)
acs: ["AC-05", "AC-06"]
files_hint: ["lib/services/dashboard/", "tests/integration/services/dashboard/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
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

# T18 — Build the dashboard SQL for sender accounts, recent invoices, Debtors and Expected payments

## Place in the sequence

- **Blocked by:** T17 — Build the dashboard SQL for currency tabs, summary stats and the chart, with the old-vs-new parity harness · **Blocks:** T19 — Switch the dashboard wrappers to the layer, pass local-date periods, record parity values and delete the in-memory code · **Wave:** 5 (DAG level). It reuses T17's `queries.ts`, `DashboardPeriod` parsing and parity harness. The old actions are still present, so they serve as the comparison.
- **Lane:** shares `lib/services/dashboard/` and `tests/integration/services/dashboard/` with T17, so the two are serialized.

## Why (user story)

> **As a** Freelancer
> **I want** my dashboard figures (revenue, the chart, sender accounts, Debtors and Expected payments) to match today's to the cent and to appear in a stable order
> **So that** I can rely on them as my invoice history grows
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers the four remaining dashboard sections as owner-joined SQL, with the deliberate naming and ordering changes and parity for everything else.

## Inlined context

> 1. The dashboard takes a Debtor's name, a sender profile's name and a bank account's bank and holder names from the most recent invoice in the group. "Most recent" means the latest issue date, and on the same issue date the invoice created last. The choice is made among the invoices the section counts (selected currency and period). Debtors tied on their exact overdue total are ordered by name, and that also decides which of them make the top three. Today all of these are arbitrary.
> 2. Dashboard amounts are exact sums of the stored two-decimal invoice totals. […]
> 3. The sender-accounts section lists sender profiles by name, and each profile's accounts by bank name and then holder name. Today the order is arbitrary.
>
> — `spec.md §1, Deliberate behaviour changes 1–3, abridged` · full text: [spec.md](../spec.md)

> Each dashboard section is one `$queryRaw` tagged-template query: sums on `numeric`, local-day and local-month buckets via `AT TIME ZONE`, "name from the most recent invoice" via `DISTINCT ON`, and ordering and top-three limits (`ORDER BY … LIMIT`) in SQL. Each query is owner-joined through `SenderProfile.userId` and its rows are parsed with zod.
>
> — `sad.md §4, choice 4, abridged` · full text: [sad.md](../sad.md)

> C->>BL: getDebtors(actor, currency)
> BL->>DB: one aggregate query joined on the owner, grouped by customer, ordered by total then name, limited to three
> DB-->>BL: at most three rows with exact sum, count and latest name
> BL->>BL: parses rows and converts each rounded sum to a number once
>
> — `sad.md §6, Critical flow 2, steps 3–6, verbatim`

> Note over S,D: names from the most recent invoice in the group (latest issue date, then latest created). Ties on the exact total are ordered by name, which decides the top three. Sender profiles by name, accounts by bank then holder
>
> — `sad.md §6, Flow 12 note, verbatim`

> | `getSenderAccounts(actor, currency, period?)` | `SenderAccountMetrics[]` | ≤ accounts shown | […] Profiles by `name`, accounts by `bankName`, then `accountName` (spec §1 change 3) |
> | `getRecentInvoices(actor, currency)` | `RecentInvoice[]` | ≤ items shown | […] |
> | `getDebtors(actor, currency)` | `DebtorInfo[]` (≤ 3) | ≤ 3 | […] The name comes from the latest overdue invoice (issue date, then created). Ties on the exact total are ordered by name (AC-06) |
> | `getExpectedPayments(actor, currency)` | `ExpectedPaymentGroup[]` | ≤ items shown | […] |
>
> Every section also answers `FAILED` (reported once), per flow 2.
>
> — `contracts/public-api.md §2.7, section table rows 3, 5–7, abridged` · full text: [public-api.md](../contracts/public-api.md)

> **Hard rule:** A raw dashboard query or a new business function forgets the owner filter, so a Freelancer sees another's data | High | ADR-0003 owner-in-`where` rule, with all dashboard SQL in one file with an owner join. A foreign-record test per id-taking function and per dashboard query (QG-1).
>
> — `sad.md §11, risk row 2, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** "rows returned by each dashboard query ≤ the number of groups or items displayed"
>
> — `sad.md §10, QG-4 Then, abridged`

**Fallback:** if a slice is insufficient or the code contradicts it, read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/0004](../adr/0004-aggregate-dashboard-figures-in-parameterized-raw-sql.md)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only columns and the indexes that serve them:

| Column / index | Type | Use here | Change |
|---|---|---|---|
| `SenderProfile.userId`, `name` | text | owner join, sender-accounts order | read-only |
| `BankAccount.senderProfileId`, `bankName`, `accountName` | text | sender accounts, order `bankName`, `accountName` | read-only |
| `Invoice.customerId`, `bankAccountId`, `status`, `currency`, `issueDate`, `dueDate`, `total`, `createdAt` | — | Debtor grouping, `DISTINCT ON` latest name, Expected payments by due date | read-only |
| `Invoice_senderProfileId_idx`, `Invoice_customerId_idx`, `Invoice_status_idx`, `Invoice_dueDate_idx`, `BankAccount_senderProfileId_idx` | existing | owner join + filters | read-only |
| — `Invoice(bankAccountId)` | — | **deferred gap**, pre-existing. The flows draw no query by bank account | none |

— `data-model.md §ER diagram + §Indexes, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `getSenderAccounts(actor, currency, period?)` → `SenderAccountMetrics[]`
- `getRecentInvoices(actor, currency)` → `RecentInvoice[]`
- `getDebtors(actor, currency)` → `DebtorInfo[]` (≤ 3)
- `getExpectedPayments(actor, currency)` → `ExpectedPaymentGroup[]`
- Errors: `VALIDATION` (`fieldErrors.period` / `fieldErrors.currency`, reusing T17's parser), `FAILED` (reported once).

— `contracts/public-api.md §2.7, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-05 — happy

> **Given** one fixed set of invoices whose totals add up with floating-point drift (for example 0.10 + 0.20), several currencies, a Customer renamed between two invoices, Debtors tied at the top-three cut-off and a Freelancer in a time zone that switches to or from daylight saving time within the selected range
> **When** the dashboard figures are produced by the old and by the new implementation
> **Then** every amount is equal after rounding to the cent, and every count, the membership of every group and every listed invoice is identical; the names shown, the order among tied entries, which tied Debtor makes the top three, and the sender-accounts order are not compared here, because they change on purpose (§1 deliberate changes 1 and 3) and are checked by AC-06
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — domain invariant

> **Given** a Customer renamed between two of their overdue invoices, and two Debtors who owe the same overdue total at the top-three cut-off
> **When** the Freelancer opens the Debtors section
> **Then** each Customer appears at most once, under the name on their most recent overdue invoice (latest issue date, then latest created). Debtors tied on their exact overdue total are ordered by name, which also decides who makes the top three. Sender profiles and their accounts appear in the fixed order of §1 deliberate change 3, so the same data always gives the same dashboard
>
> — `spec.md §5, AC-06, verbatim`

## Checklist

- [ ] RED: add the four sections to the T17 parity harness in `tests/integration/services/dashboard/parity.test.ts`. Compare amounts to the cent, counts, group membership and listed invoice ids. Exclude names, tie order and sender-accounts order, per AC-05.
- [ ] RED: `tests/integration/services/dashboard/naming-order.test.ts` (AC-06): renamed Customer → latest name; same issue date → latest `createdAt` wins; a tie at the cut-off → ordered by name, deciding the top three; sender profiles by name, accounts by bank then holder. Add two-Freelancer isolation and a row count per query.
- [ ] `lib/services/dashboard/queries.ts`: add four `$queryRaw` tagged templates, each joined through `"SenderProfile"` with `sp."userId" = ${actor.userId}`. Debtors: `GROUP BY` customer, `SUM(total)`, the name via `DISTINCT ON ("customerId") … ORDER BY "issueDate" DESC, "createdAt" DESC`, `ORDER BY total DESC, name ASC LIMIT 3`. Sender accounts: bank and holder names from the latest invoice per account, ordered as in deliberate change 3. Add zod row schemas.
- [ ] `lib/services/dashboard/dashboard.ts`: `getSenderAccounts`, `getRecentInvoices`, `getDebtors`, `getExpectedPayments`, each in its `dashboard.<section>` span, with `failed()` on error. Return today's DTOs from `types/dashboard/types.ts`, unchanged.
- [ ] Do not touch `lib/actions/dashboard-actions.ts` (T19).

## Edge cases

| Case | Behaviour |
|---|---|
| Customer renamed between two overdue invoices | appears once, under the name on the latest overdue invoice (issue date, then created) |
| two Debtors with an equal exact total at place 3 | ordered by name, and the first by name makes the top three |
| two invoices on the same issue date with different names | the one created last supplies the name |
| float-drift totals (0.10 + 0.20) | exact `numeric` sum `0.30`, converted to number once |
| no overdue invoices in the currency | empty Debtors list |
| Freelancer B's invoices, accounts or customers | never appear or count for A |
| database error | `FAILED`, reported once |

## Definition of Done

- [ ] The parity test passes for all seven sections (T17 + T18) on the AC-05 fixture.
- [ ] The AC-06 naming and tie-order test passes, and the sender-accounts order matches deliberate change 3.
- [ ] Row count per query ≤ groups or items displayed. A two-Freelancer test exists per query.
- [ ] All dashboard SQL lives in `lib/services/dashboard/queries.ts`, owner-joined.
- [ ] Every Hard Rule inlined above still holds.
- [ ] lint + `tsc --noEmit` clean.
