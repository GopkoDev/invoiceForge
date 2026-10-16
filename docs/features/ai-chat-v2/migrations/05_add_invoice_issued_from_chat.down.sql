-- Reverts 05. Which invoices were issued from the chat is lost, and with it the "drafts issued from the chat" KPI.
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "issuedFromChat";
