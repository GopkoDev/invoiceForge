-- AlterTable
-- Drop unique constraint to allow multiple custom prices per product-customer
-- Add name field for labeling different price tiers
DROP INDEX IF EXISTS "CustomPrice_productId_customerId_key";

ALTER TABLE "CustomPrice" ADD COLUMN "name" TEXT;

-- Add index on productId for better query performance
CREATE INDEX "CustomPrice_productId_idx" ON "CustomPrice"("productId");

