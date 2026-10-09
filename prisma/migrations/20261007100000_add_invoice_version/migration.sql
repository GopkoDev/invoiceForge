-- invoice-integrity (ADR-0004). Optimistic-concurrency counter: every service write to an invoice sets
-- "version" = "version" + 1, and an editor save carrying an older loadedVersion is refused with CONFLICT (AC-10).
-- NOT NULL with a constant DEFAULT is a catalog-only change in PostgreSQL 11+ (no table rewrite, brief lock).
-- Existing invoices start at 0. The previous build never writes the column and keeps working (SAD §7).
-- Body matches `prisma migrate diff` for Invoice.version in data-model.md, made idempotent.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
