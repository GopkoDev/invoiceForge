-- Reverts 10. MUST stay the only statement in its file (CONCURRENTLY).
DROP INDEX CONCURRENTLY IF EXISTS "Invoice_assistantKeyId_idx";
