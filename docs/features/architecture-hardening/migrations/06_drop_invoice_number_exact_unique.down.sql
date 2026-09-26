-- Reverts 06. Can't fail on data: the key unique already rules out exact duplicates.
-- MUST stay the only statement in its file (CONCURRENTLY).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_senderProfileId_invoiceNumber_key" ON "Invoice"("senderProfileId", "invoiceNumber");
