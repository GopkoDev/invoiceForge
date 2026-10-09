-- invoice-integrity (SAD §6 flow 9, AC-13). The bank-account currency lock counts the invoices that use the account
-- (any status), so Invoice.bankAccountId needs an index. It is also the only Invoice FK without one: the RESTRICT check
-- on a bank-account delete scans Invoice today.
--
-- MUST stay the only statement in its migration: CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
-- and a multi-statement script runs as one implicit transaction.
-- If a concurrent build fails it leaves an INVALID index that IF NOT EXISTS would skip:
-- check pg_index.indisvalid, and DROP INDEX CONCURRENTLY + re-run if it is false.
-- Name matches Prisma's default for @@index([bankAccountId]), so migrate diff sees no drift.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_bankAccountId_idx" ON "Invoice"("bankAccountId");
