-- Reverts 04. Single statement for the same reason as the up file.
DROP INDEX CONCURRENTLY IF EXISTS "Invoice_senderProfileId_invoiceNumberKey_key";
