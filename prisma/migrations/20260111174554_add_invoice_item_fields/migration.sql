/*
  Warnings:

  - Added the required column `name` to the `InvoiceItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: Add new columns with defaults, migrate data, then remove defaults
ALTER TABLE "InvoiceItem" 
ADD COLUMN "name" TEXT NOT NULL DEFAULT '',
ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN "currency" "Currency",
ALTER COLUMN "description" DROP NOT NULL;

-- Migrate existing data: copy description to name
UPDATE "InvoiceItem" SET "name" = "description" WHERE "name" = '';

-- Optional: Clear description since we moved data to name
UPDATE "InvoiceItem" SET "description" = NULL;

-- Remove default from name column (it was only for migration)
ALTER TABLE "InvoiceItem" ALTER COLUMN "name" DROP DEFAULT;
