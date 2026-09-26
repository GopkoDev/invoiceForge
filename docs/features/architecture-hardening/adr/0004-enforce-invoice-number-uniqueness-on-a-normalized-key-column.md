---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
ticket: "code-review 2026-09-26: L2, L4"
---

# 0004 — Enforce invoice-number uniqueness on a normalized key column

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`Invoice` has `@@unique([senderProfileId, invoiceNumber])` (`prisma/schema/invoice.prisma:213`), which compares strings exactly. AC-08 defines two numbers as the same when they match ignoring letter case and leading or trailing spaces ("INV-001" and " inv-001 "). The invariant "an invoice number can never repeat within one sender profile" (CONTEXT) therefore isn't enforced by the database today. The spec (§1) makes a one-time clean-up a design blocker only if existing duplicates exist. A read-only count on 2026-09-26 against the database configured in `.env` found **0** normalized duplicate groups across 27 invoices.

## Decision drivers

- CONTEXT invariant: an invoice number can never repeat within one sender profile.
- AC-08 (normalized comparison), AC-07 (concurrent saves), AC-17 (legacy shared numbers).
- §6 NFR: 0 minutes of planned downtime; schema changes backward-compatible within a wave.
- §2 constraint: Prisma 7 migrations with the split schema. Anything the schema file can't describe drifts.

## Considered options

1. **Normalized key column.** Add `invoiceNumberKey = lower(trim(invoiceNumber))`, computed by one app function on every write, with `@@unique([senderProfileId, invoiceNumberKey])` replacing the exact-match unique.
2. **Postgres expression index** on `(senderProfileId, lower(btrim(invoiceNumber)))`, written by hand in migration SQL. No extra column, but the Prisma schema can't express it, so later `prisma migrate dev` runs see it as drift and try to drop it.

## Decision outcome

**Chosen:** Option 1. Everything stays expressible in the Prisma schema, the database enforces the invariant under concurrency, and the normalization rule lives in one function (`normalizeInvoiceNumber`) shared by the save path and the "already used" check.

Migration (expand-only, wave 2): add `invoiceNumberKey` nullable → backfill from `invoiceNumber` → create the unique index → make it `NOT NULL`. Before the index step, the migration counts normalized duplicates. With 0 duplicates (the measured case), uniqueness applies to every invoice at once, as spec §1 prescribes. If the production count is above 0, the column stays nullable, the duplicate rows keep `NULL` (Postgres treats NULLs as distinct), and those invoices follow AC-17: viewable, but not saveable until renumbered, because every save writes a non-null key.

## Consequences

**Positive**
- The database guarantees the invariant; the unique violation is the concurrency backstop for ADR-0005.
- AC-08's "already used" check is a single indexed lookup.

**Negative**
- The key is denormalized. Any write path that changes `invoiceNumber` without recomputing the key breaks uniqueness semantics, so all writes go through the invoice actions (there is no other writer today).
- If the production count differs from the `.env` count, the fallback leaves a nullable column and a small AC-17 code path alive.

**Neutral**
- Switching to an expression index later means dropping the column. That is cheap, but it needs a migration.

## Links

- Spec: [[../spec.md]] AC-07, AC-08, AC-17, §1 (assumption), §8 (clean-up question)
- SAD: [[../sad.md]] §4, §11
- Related ADR: [[0005-allocate-invoice-numbers-under-a-sender-profile-row-lock]]
