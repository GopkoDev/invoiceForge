---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
ticket: "code-review 2026-09-26: L3, L5"
---

# 0006 — Compute invoice amounts in one shared exact-decimal module used by both editor and server

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The server stores the line `total` the browser sends (`z.number()`, never recomputed, L3), and the discount isn't capped (L5), so negative or wrong totals reach the PDF and the dashboard. The editor computes live totals in the browser. AC-13 requires the stored figures to be computed by the system, and the saved total to equal what the editor showed.

## Decision drivers

- AC-13: line total = quantity × price rounded to 2 decimals half-up; subtotal = sum of rounded lines; tax rounded once; the editor uses the same rule.
- AC-14/AC-15: range rules, and discount ≤ subtotal + shipping, so the total is never negative.
- AC-17: legacy invoices whose stored total differs are shown old vs new before saving.
- Money columns are `Decimal(10,2)`. JavaScript floats can't represent these values exactly.

## Considered options

1. **One pure shared module.** `lib/helpers/invoice-calculations.ts` does exact decimal arithmetic with half-up rounding. It is imported by the editor (live totals) and by the invoice actions (stored values); the server ignores client-sent totals; zod enforces the ranges and the discount cap.
2. **Compute in the database** (generated columns or a trigger). One source of truth inside Postgres, but Prisma's support is poor (hand-written SQL, drift), and the editor still needs the same formula for live totals, which means two implementations in two languages that can diverge.

## Decision outcome

**Chosen:** Option 1. "Editor showed X, server stored Y" becomes impossible by construction, because both run the same function. The module is pure: no Prisma and no server imports, since it ships in the browser bundle. Inputs and outputs are decimal strings or integer minor units, never floats. The PDF and the dashboard read the stored values.

## Consequences

**Positive**
- Fixes L3 and L5, and gives AC-17's old-vs-new comparison its "new" figure for free.
- The rules are unit-testable in isolation once a test harness exists (F7 follow-up).

**Negative**
- The module becomes a browser dependency. If exact arithmetic needs a library (e.g. `decimal.js`), it adds a few KB to the editor bundle; integer minor units with `BigInt` avoid that.
- Legacy invoices recompute on their next edit, so a Freelancer may see a changed total (handled by AC-17's confirmation).

**Neutral**
- Existing stored totals are not bulk-corrected (spec §3 non-goal).

## Links

- Spec: [[../spec.md]] AC-13, AC-14, AC-15, AC-17
- SAD: [[../sad.md]] §4, §5
