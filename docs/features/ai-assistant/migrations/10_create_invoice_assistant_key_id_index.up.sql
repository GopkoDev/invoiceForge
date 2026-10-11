-- ai-assistant (ADR-0013). FK index for Invoice.assistantKeyId: the SET NULL on a PersonalKey delete (account deletion,
-- flow 12) would otherwise scan Invoice once per key.
--
-- MUST stay the only statement in its migration: CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
-- and a multi-statement script runs as one implicit transaction.
-- If a concurrent build fails it leaves an INVALID index that IF NOT EXISTS would skip:
-- check pg_index.indisvalid, and DROP INDEX CONCURRENTLY + re-run if it is false.
-- Name matches Prisma's default for @@index([assistantKeyId]), so migrate diff sees no drift.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_assistantKeyId_idx" ON "Invoice"("assistantKeyId");
