---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-01"
feature_size: "M"
ticket: "service-layer"
---

# 0003 — Scope every write by owner in its own where clause

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Many mutations check ownership in one step and write by the bare id in the next, e.g. `lib/actions/customer-actions.ts:135-149`: `findFirst({ where: { id, userId } })`, then `update({ where: { id } })`. The spec names this the sharpest failure mode of the move (spec §1, §6.1): if the two steps drift apart in the new layer, an Assistant could change another Freelancer's data. Ownership sits at different depths per model. `Customer`, `Product` and `SenderProfile` have `userId`. `Invoice` and `BankAccount` reach it through `senderProfile`, `CustomPrice` through `customer`, and invoice items through `invoice`.

## Decision drivers

- Quality goal 1 / AC-08, AC-19: a foreign record behaves exactly like a missing one and stays unchanged.
- Spec §6: 100% of functions taking a record id have a foreign-record test (read, change, delete).
- Spec §3: no stored-data or schema change, which excludes database-enforced options such as row-level security.

## Considered options

1. **Owner filter in the write's own `where`.** Every `update`/`delete` uses Prisma's extended unique `where`, e.g. `{ id, userId }` or `{ id, senderProfile: { userId } }`. A miss (`P2025`) maps to `NOT_FOUND`. A pre-read remains only where the logic needs it (invoice count, totals-changed), and it is owner-filtered too.
2. **A tenant-scoped Prisma client via `$extends`.** `dbFor(actor)` injects the owner filter into every query on tenant models, and business functions never see the bare client.

## Decision outcome

**Chosen:** Option 1. It is explicit at every call site and needs no infrastructure. It works the same way for nested writes, the numbering row lock and transactions, where a query extension is fragile given owners at four different depths. Raw SQL (ADR-0004) would bypass an extension anyway.

## Consequences

**Positive**
- The write itself carries the owner, so no check can drift from its write.
- Readable in review. Each function's foreign-record test proves it.

**Negative**
- The discipline rests on tests and review: a new function without the filter still compiles.
- If Prisma rejects a relation filter inside a unique `where` for some model, that write falls back to `updateMany`/`deleteMany({ where: { id, <owner path> } })` with `count === 0 → NOT_FOUND`. This is verified in the first migration wave (§11).

**Neutral**
- Moving to row-level security later is possible but needs schema policies and per-transaction session settings through the Neon pooler, i.e. its own feature.

## Links

- Spec: [[../spec.md]] — US-06; AC-08, AC-09, AC-19; §6 Tenant isolation; §6.1 check-then-write abuse case
- SAD: [[../sad.md]] §4 (choice 3), §8 (Authorization), §11
- Related ADR: [[0001-pass-a-branded-acting-freelancer-to-every-business-function]], [[0004-aggregate-dashboard-figures-in-parameterized-raw-sql]]
