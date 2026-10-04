---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "mcp-server"
---

# 0005 — Compute overdue at read time from one shared rule module

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Today the dashboard counts an invoice as overdue only when its stored status is `OVERDUE` (`lib/services/dashboard/queries.ts`), so it would disagree with an Assistant from day one. Spec §1 fixes the rule: an issued, unpaid invoice is overdue when it was marked overdue or its due date (a calendar day) is before today in the Freelancer time zone; stored statuses never change. The dashboard (raw SQL, service-layer ADR-0004), the invoice list and customer page (Prisma queries), the invoice page and the MCP tools must all apply it identically.

## Decision drivers

- Quality goal 1 / spec §6 NFR: 100 % of figures equal the dashboard to the cent.
- AC-23, AC-23b: day boundaries in the Freelancer time zone must be testable at fixed instants.
- AC-24: stored status unchanged; every surface shows the derived status.

## Considered options

1. **Shared rule module in code** — `lib/services/_shared/overdue.ts` exports a parameterized `Prisma.sql` fragment, a Prisma `where` condition and a single-row TypeScript predicate, each taking `today` computed from `ActingFreelancer.timeZone`.
2. **Rule in Postgres** — an SQL function `invoice_is_overdue(status, due_date, today)` or a view with an `effective_status` column derived from `User.timeZone`.

## Decision outcome

**Chosen:** Option 1. `today` comes from the application clock, so the time-zone edge cases are unit-testable with a fake clock; the Prisma-based lists keep their query builder; and it matches the existing pattern of parameterized SQL in the business layer.

## Consequences

**Positive**
- One module owns the rule; dashboard, lists, customer page, invoice page and MCP import it.
- Pure `today`-in, boolean-out tests cover AC-12, AC-23, AC-23b directly.

**Negative**
- Three forms of one rule (SQL fragment, Prisma condition, TS predicate) must stay equivalent; an equivalence test runs all three over the same seeded fixture.
- A future query that writes `status = 'OVERDUE'` by hand would bypass the rule; a scanning test fails on any such literal outside the module.

**Neutral**
- "Mark as overdue" / "back to pending" stop being offered for derived-overdue invoices (AC-24); the stored `OVERDUE` value remains meaningful for hand-marked invoices.

## Links

- Spec: [[../spec.md]] §1, AC-12, AC-23, AC-23b, AC-24
- SAD: [[../sad.md]] §4, §8, §10
- Related ADR: [[0006-save-the-freelancer-time-zone-on-the-account]], service-layer [[../../service-layer/adr/0004-aggregate-dashboard-figures-in-parameterized-raw-sql]]
