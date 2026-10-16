-- ai-assistant (ADR-0011; AC-25, AC-26, AC-29; SAD §6 flows 3 and 10). Draft permission, chosen only when a key is
-- created; no update path writes it. Every existing key gets false and stays read-only (AC-26).
-- NOT NULL with a constant DEFAULT is a catalog-only change in PostgreSQL 11+ (no table rewrite, brief lock).
-- The previous build never reads the column and keeps working.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- AlterTable
ALTER TABLE "PersonalKey" ADD COLUMN IF NOT EXISTS "canCreateDrafts" BOOLEAN NOT NULL DEFAULT false;
