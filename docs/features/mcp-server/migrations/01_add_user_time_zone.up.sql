-- mcp-server (ADR-0006). The Freelancer time zone moves from the browser cookie onto the account.
-- Nullable, no default: a catalog-only change (no rewrite, brief lock), and the previous build ignores it.
-- NULL means "not saved yet": every surface uses UTC until the first-visit seed or a settings change fills it.
-- No backfill: existing Freelancers are filled on their next visit (ADR-0006, Neutral).
-- Body matches `prisma migrate diff` for User.timeZone in data-model.md, made idempotent.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timeZone" TEXT;
