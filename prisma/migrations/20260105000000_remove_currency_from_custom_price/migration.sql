-- AlterTable
-- Remove currency column from CustomPrice table
-- Currency will now be inherited from the Product table
ALTER TABLE "CustomPrice" DROP COLUMN "currency";

