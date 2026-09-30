-- Wave 2, step 1 of 3 (expand; ADR-0004). Nullable column, no default: instant, and old code that doesn't write it keeps working.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "invoiceNumberKey" TEXT;
