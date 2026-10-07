-- mcp-server (spec §8 open question, resolved at data-model 2026-10-04): the one-time dashboard notice
-- about the new overdue rule is dismissed per account, so it shows once across every device.
-- Nullable, no default: a catalog-only change, and the previous build ignores it.
-- Body matches `prisma migrate diff` for User.overdueNoticeDismissedAt in data-model.md, made idempotent.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "overdueNoticeDismissedAt" TIMESTAMP(3);
