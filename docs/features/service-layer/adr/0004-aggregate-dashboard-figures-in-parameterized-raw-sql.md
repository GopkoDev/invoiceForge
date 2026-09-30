---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-01"
feature_size: "M"
ticket: "service-layer"
---

# 0004 — Aggregate dashboard figures in parameterized raw SQL

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The dashboard sections (`lib/actions/dashboard-actions.ts`: summary stats, chart, sender accounts, recent invoices, Debtors, Expected payments) load every matching invoice with `findMany` and add them up in JavaScript via `Decimal.toNumber()`. That is slow as history grows and carries floating-point noise. The spec needs local-day and local-month buckets in the Freelancer's time zone, "name from the most recent invoice in the group" (latest issue date, then latest created), ties ordered by name, and exact sums. Prisma's `groupBy`/`aggregate` can do none of the first three, so at least part of it must be raw SQL.

## Decision drivers

- Spec §6: rows returned by each dashboard query ≤ the number of groups or items displayed. Amounts within 0.01 of the old figures, with identical counts and membership.
- AC-05, AC-06, AC-21: DST-safe local buckets, deterministic names and tie order.
- Quality goal 1: raw SQL doesn't get the owner filter automatically, so every query must carry it visibly.
- §2: the generator has no preview features. TypedSQL is still Preview across Prisma 7.x and needs a live database at `prisma generate --sql`.

## Considered options

1. **`$queryRaw` tagged templates + zod row parsing.** One parameterized query per section in `lib/services/dashboard/queries.ts`. Every query joins `SenderProfile` and filters `sp."userId" = ${actor.userId}`. Rows are parsed with zod (`numeric` → decimal string, `bigint` count → number).
2. **Prisma TypedSQL.** `.sql` files in `prisma/sql/` compiled to typed functions by `prisma generate --sql`.

## Decision outcome

**Chosen:** Option 1. It needs no preview feature and no build-pipeline change: Vercel and CI run `prisma generate` without a database today. It has a precedent in the repo (the numbering row lock), and it keeps full control over `AT TIME ZONE` and `DISTINCT ON`.

## Consequences

**Positive**
- Exact sums on `numeric`. Data read no longer depends on invoice count.
- One file holds all dashboard SQL, so the owner-join rule is reviewable in one place.

**Negative**
- Row types are written by hand. A renamed column fails the integration tests, not the compiler (they run on every PR).
- SQL identifiers must be quoted to match Prisma's model names (`"Invoice"`, `"senderProfileId"`).

**Neutral**
- Moving to TypedSQL once it is GA is a per-query swap behind the same function signatures.

## Links

- Spec: [[../spec.md]] — US-02, US-07; AC-05, AC-06, AC-21; §6 Dashboard parity, Data read per dashboard load
- SAD: [[../sad.md]] §4 (choice 4), §6 (flow 2), §10 (QG-2, QG-4)
- Related ADR: [[0003-scope-every-write-by-owner-in-its-own-where-clause]]
