-- Reverts 09. First-issue times are lost.
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "issuedAt";
