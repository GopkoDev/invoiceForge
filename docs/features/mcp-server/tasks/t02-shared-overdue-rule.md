---
id: T02
title: "Add the shared overdue rule module with its SQL, Prisma and TypeScript forms"
layer: "domain"
deps: []
blocks: ["T06", "T07"]
acs: ["AC-12", "AC-23", "AC-23b"]
files_hint: ["lib/services/_shared/overdue.ts", "tests/unit/services/overdue.test.ts", "tests/integration/services/_shared/overdue-equivalence.test.ts", "tests/unit/services/overdue-literal-scan.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T02 — Add the shared overdue rule module with its SQL, Prisma and TypeScript forms

## Place in the sequence

- **Blocked by:** — · **Blocks:** T06 — Apply the shared overdue rule to every dashboard figure and show tabs for issued-invoice currencies, T07 — Return the derived status from every invoice read and filter by the shared rule · **Wave:** 1 — pure rule, needs no new schema.
- **Lane:** own lane.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** the Freelancer's overdue invoices and Debtors, with amounts per currency and days overdue
> **So that** the Freelancer gets a correct "who owes me" answer in the conversation
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my time zone saved on my account and used by the dashboard and by every Assistant
> **So that** "overdue", "today" and "this month" mean the same thing wherever I ask
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task delivers the one rule (and "today" in a zone, and days overdue) that every surface will import.

## Inlined context

> **The overdue rule is computed when data is read and shared with the dashboard.** An issued, unpaid invoice is overdue when it was marked overdue or its due date is before today in the Freelancer time zone. A due date is a calendar day, the date the Freelancer entered, and is compared with today's date in the Freelancer time zone without any shift. Stored statuses do not change.
>
> — `spec.md §1, interview decisions, overdue rule, abridged` · full text: [spec.md](../spec.md)

> **Chosen:** Option 1. `today` comes from the application clock, so the time-zone edge cases are unit-testable with a fake clock; the Prisma-based lists keep their query builder. Option 1 = **Shared rule module in code** — `lib/services/_shared/overdue.ts` exports a parameterized `Prisma.sql` fragment, a Prisma `where` condition and a single-row TypeScript predicate, each taking `today` computed from `ActingFreelancer.timeZone`.
>
> — `adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md, Decision outcome + Option 1, abridged` · full text: [ADR-0005](../adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md)

> **Hard rule:** Three forms of one rule (SQL fragment, Prisma condition, TS predicate) must stay equivalent; an equivalence test runs all three over the same seeded fixture. A future query that writes `status = 'OVERDUE'` by hand would bypass the rule; a scanning test fails on any such literal outside the module.
>
> — `adr/0005-…, Consequences / Negative, verbatim` · full text: [ADR-0005](../adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md)

> Time zone and dates — "Today", day and period bounds use the account time zone (UTC until saved); due dates are calendar days compared without shift.
>
> — `sad.md §8, Time zone and dates, abridged` · full text: [sad.md](../sad.md)

> Known callers that hand-write `OVERDUE` today: `lib/services/dashboard/queries.ts`, `components/invoices/invoice-row-actions.tsx`, `components/invoices/invoices-toolbar.tsx`, `components/dashboard/recent-invoices/dashboard-recent-invoices.tsx`, `types/invoice/types.ts`. The scan test may start with these on a temporary allow-list; T06/T07/T08 remove them, T08's DoD leaves it empty.
>
> — `grep -rl OVERDUE lib app components types` at commit 1122814, abridged · re-run the grep: the code wins

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. Module exports (names are this breakdown's; keep them unless the code suggests better):
`todayIn(timeZone, now) → LocalDate`, `overdueSql(today)` (`Prisma.sql`), `overdueWhere(today)` (Prisma `where`), `isOverdue(row, today)`, `daysOverdue(dueDate, today)` (≥ 0), `derivedStatus(row, today)`.

> `daysOverdue`: For `overdue` rows, whole days from the due date to today in the Freelancer time zone, never below 0 (AC-12); null otherwise.
>
> — `contracts/openapi.yaml, InvoiceRow.daysOverdue, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-12 — happy path

> **Given** a Freelancer in the Kyiv time zone with three issued, unpaid invoices: one due yesterday and never marked overdue, one marked overdue by hand, and one due tomorrow
> **When** an Assistant asks for their overdue invoices
> **Then** it receives the first two and not the third. Each row has the customer, invoice number, sender profile, amount, currency, due date and days overdue, together with the total overdue amount and count per currency, computed by invoiceFlow over every overdue invoice, not only the rows on the current page. Days overdue is the number of whole days from the due date to today in the Freelancer time zone, never below 0: the invoice due yesterday shows 1, and an invoice marked overdue by hand before its due date shows 0
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

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

(This task owns the rule-level half of these ACs; the surfaces apply it in T06, T07, T14, T18.)

## Checklist

- [ ] `lib/services/_shared/overdue.ts` (`server-only`) — the six exports above; the SQL fragment and Prisma condition take `today` as a bound parameter, never `now()`.
- [ ] `tests/unit/services/overdue.test.ts` — `todayIn` at the AC-23 (Europe/Kyiv, 00:30 on the 1st) and AC-23b (America/New_York, 21:00 and 00:00) instants under a fake clock; `isOverdue` for the three AC-12 invoices; `daysOverdue` 1 and 0.
- [ ] `tests/integration/services/_shared/overdue-equivalence.test.ts` — one fixture (pending past due, pending future, hand-marked overdue before due, paid past due, draft past due, cancelled past due); all three forms select the same ids.
- [ ] `tests/unit/services/overdue-literal-scan.test.ts` — fails on `'OVERDUE'` status checks outside `overdue.ts` beyond a temporary, named allow-list.

## Edge cases

| Case | Behaviour |
|---|---|
| Paid, draft or cancelled invoice past its due date | not overdue (only issued, unpaid invoices) |
| Hand-marked overdue before its due date | overdue, `daysOverdue` = 0 |
| Due date equal to today in the zone | not overdue |
| `timeZone` NULL on the account | caller passes `UTC`; rule itself only sees a zone string |
| DST transition day | `todayIn` uses the zone's calendar date; no hour arithmetic on due dates |

## Definition of Done

- [ ] Unit tests for todayIn(zone), isOverdue and daysOverdue pass at the AC-23 and AC-23b instants under a fake clock, the equivalence test shows the SQL fragment, Prisma condition and TS predicate select the same invoices on one fixture, and the scanning test fails on a hand-written OVERDUE status check outside the module.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
