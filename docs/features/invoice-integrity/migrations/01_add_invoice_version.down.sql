-- Reverts 01. Deploy the previous build first: the new code reads and bumps "version" on every invoice write.
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "version";
