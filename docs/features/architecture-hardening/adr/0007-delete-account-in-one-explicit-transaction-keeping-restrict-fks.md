---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
ticket: "code-review 2026-09-26: L1"
---

# 0007 — Delete an account in one explicit transaction, keeping Restrict foreign keys on invoices

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`deleteUserAccount` deletes the `User` and relies on cascades, but `Invoice.senderProfile`, `Invoice.customer` and `Invoice.bankAccount` are `onDelete: Restrict` (`prisma/schema/invoice.prisma:205-207`). Every Freelancer with an invoice therefore fails to delete their account (L1; 100% failure per spec §7). The adversarial pass in the spec warned that making deletes cascade through the schema would let deleting one Customer silently destroy that Customer's invoices.

## Decision drivers

- AC-20: remove everything, or nothing, including invoices with their lines, sender profiles with bank accounts, Customers, products, custom prices, sign-in links, email history and sessions.
- AC-22 / CONTEXT invariant: a Customer or sender profile that has invoices can never be deleted on its own.
- §7 KPI: 0 failed deletions within 14 days of release.
- §2 constraint: no tests, so behaviour that depends on subtle database semantics is a liability.

## Considered options

1. **Explicit transaction; leave the foreign keys alone.** In one interactive transaction, delete the invoices of the Freelancer's sender profiles (their items cascade), then delete the `User`. Existing cascades remove accounts, email history, sender profiles with bank accounts, Customers with custom prices, and products.
2. **Add `Invoice.userId` with cascade, and turn the invoice foreign keys into `NoAction`.** Postgres checks NoAction at the end of the statement, so one `DELETE User` cascades everything while a single Customer delete still fails. This needs a migration, a backfill, and reliance on the NoAction-vs-Restrict difference.

## Decision outcome

**Chosen:** Option 1. It needs no migration, the order of deletion is visible in one function, and AC-22 stays enforced by the database itself, because the Restrict keys are untouched. The warning count ("N invoices will be permanently lost") is read before the confirmation dialog, and the delete runs only after confirmation.

## Consequences

**Positive**
- Fixes L1 with no schema change; AC-22 cannot regress through this change.
- All-or-nothing: any failure rolls back and nothing is removed (the ux-flows failure path returns to settings with an error).

**Negative**
- A future entity that references `Invoice` or a Freelancer-owned row with `Restrict` must be added to this transaction, or deletion breaks again. This is noted in the conventions (§8).
- A Freelancer with very many invoices makes one long transaction. That is acceptable at current scale (§7 thresholds).

**Neutral**
- Sessions are JWT (ADR-0002). There are no session rows to delete; the stale-token rule covers other devices.

## Links

- Spec: [[../spec.md]] AC-20, AC-21, AC-22, AC-24, §7
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0002-treat-sessions-without-a-live-account-as-visitors]]
