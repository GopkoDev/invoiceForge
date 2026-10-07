---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
ticket: "invoice-integrity"
---

# 0005 — Guard single defaults with partial unique indexes and a parent-row lock

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`SenderProfile.isDefault` and `BankAccount.isDefault` are plain booleans. "Set as default" clears the old default and sets the new one in two queries with no transaction or constraint, so a double-click or two tabs leave two defaults and a failure in between leaves none (brief D9). The spec requires exactly one default sender profile per Freelancer and one default bank account per sender profile while any exist: the first one created becomes the default, deleting the default promotes the earliest-created remaining one, the default cannot be unset, and a failed switch keeps the old default (AC-17, AC-17b). The release repairs existing duplicates and gaps by keeping or promoting the earliest-created one (AC-18).

## Decision drivers

- Quality goal 2; spec §6 NFR "Default uniqueness": exactly 1 default after 10 parallel "set as default" requests, for sender profiles and for bank accounts.
- AC-18: the repair changes nothing else about profiles, accounts or invoices.
- Every reader of `isDefault` (editor pre-selection, list ordering) should keep working unchanged.
- Account deletion keeps `RESTRICT` foreign keys (architecture-hardening ADR-0007).

## Considered options

1. **Partial unique indexes plus a parent-row lock** — `UNIQUE (userId) WHERE isDefault` on `SenderProfile` and `UNIQUE (senderProfileId) WHERE isDefault` on `BankAccount`; every default-changing write runs in one transaction that first locks the parent row.
2. **A default pointer on the parent** — `User.defaultSenderProfileId` and `SenderProfile.defaultBankAccountId`, dropping `isDefault`.
3. **The transaction and lock only**, with no database constraint.

## Decision outcome

**Chosen:** Option 1. The database guarantees "at most one" on every path, present and future; the service guarantees "at least one" under a lock on the parent (`User` row for profiles, `SenderProfile` row for accounts) that also serializes the 10 parallel requests. Make-default clears and sets inside that transaction, so a failure rolls back to the old default. Create sets `isDefault` when no sibling exists; delete of the default promotes the earliest-created remaining sibling in the same transaction; an update that tries to clear the flag without choosing another is refused. Prisma's schema cannot express partial indexes, so they are raw SQL in the migration, which first repairs duplicates and gaps (earliest-created wins) and then creates the indexes in the same migration transaction. Option 2 would rewrite every reader and add cyclic foreign keys that complicate account deletion, and still needs the service for "at least one"; option 3 leaves no backstop for a future writer that forgets the lock.

## Consequences

**Positive**
- A duplicate default becomes impossible; a violation surfaces as a unique-constraint error the service maps to a retryable `CONFLICT`, never as silent bad data.
- No reader changes.

**Negative**
- The indexes live outside `schema.prisma` and must be recorded in the data model so later migrations do not drop them.

**Neutral**
- The repair runs once at release and reports how many rows it changed.

## Links

- Spec: [[../spec.md]] US-08; AC-17, AC-17b, AC-18
- SAD: [[../sad.md]] §4
