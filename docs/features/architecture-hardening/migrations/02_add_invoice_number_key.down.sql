-- Reverts 02. Run 04.down first if the unique index exists (dropping the column would drop it implicitly, but not concurrently).
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "invoiceNumberKey";
