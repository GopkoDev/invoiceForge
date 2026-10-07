-- Reverts 02. MUST stay the only statement in its file (CONCURRENTLY).
DROP INDEX CONCURRENTLY IF EXISTS "Invoice_bankAccountId_idx";
