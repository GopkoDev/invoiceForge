-- Reverts 05. Guarded so a re-run after 02.down (column already gone) is a no-op.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Invoice' AND column_name = 'invoiceNumberKey') THEN
        ALTER TABLE "Invoice" ALTER COLUMN "invoiceNumberKey" DROP NOT NULL;
    END IF;
END $$;
