-- Wave 2, step 3 of 3 (ADR-0004). Enforces "an invoice number never repeats within a sender profile" on the normalized key.
-- Also the concurrency backstop for the ADR-0005 allocator and the AC-08 / AC-09 "is this key taken" lookup.
--
-- MUST stay the only statement in its migration: CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
-- and a multi-statement script runs as one implicit transaction.
-- If a concurrent build fails it leaves an INVALID index that IF NOT EXISTS would skip:
-- check pg_index.indisvalid, and DROP INDEX CONCURRENTLY + re-run if it is false.
-- Name matches Prisma's default for @@unique([senderProfileId, invoiceNumberKey]), so migrate diff sees no drift.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_senderProfileId_invoiceNumberKey_key" ON "Invoice"("senderProfileId", "invoiceNumberKey");
