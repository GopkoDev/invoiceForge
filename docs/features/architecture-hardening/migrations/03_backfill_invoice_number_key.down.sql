-- Reverts 03. Clears every key; harmless while the column is nullable. Run 05.down first if 05 was applied.
-- Guarded so a re-run after 02.down (column already gone) is a no-op.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Invoice' AND column_name = 'invoiceNumberKey') THEN
        UPDATE "Invoice" SET "invoiceNumberKey" = NULL WHERE "invoiceNumberKey" IS NOT NULL;
    END IF;
END $$;
