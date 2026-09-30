-- Wave 4 (contract; SAD §7, ADR-0004). PROMOTE ONLY IF BOTH HOLD:
--   1. wave 2 has run in production without a rollback, and
--   2. the pre-flight in data-model.md returns 0 rows with a NULL key (the ADR-0004 fallback was not taken).
-- If either fails, do not promote 05 or 06: the column stays nullable for good (accepted debt, SAD §11).
-- If NULL keys remain, this statement fails and the migration applies nothing.
-- Takes a short ACCESS EXCLUSIVE lock with a full scan. Fine at current size (27 invoices on the configured DB).

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "invoiceNumberKey" SET NOT NULL;
