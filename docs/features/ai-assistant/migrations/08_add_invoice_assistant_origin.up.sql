-- ai-assistant (ADR-0013; AC-23; SAD §6 flows 2, 3, 11). The Assistant origin of a draft, written once at creation:
-- CHAT or PERSONAL_KEY, the key's name at that moment, and the key id (NULL once the key row is deleted).
-- Three nullable columns: catalog-only, no rewrite. Existing invoices keep NULL (made by hand).
-- The FK check scans Invoice once while every value is NULL (a brief SHARE ROW EXCLUSIVE lock on Invoice and
-- PersonalKey; Invoice holds at most a few thousand rows per Freelancer). Its index is 10, kept apart (CONCURRENTLY).
-- The previous build never reads the columns and keeps working.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssistantOrigin') THEN
        CREATE TYPE "AssistantOrigin" AS ENUM ('CHAT', 'PERSONAL_KEY');
    END IF;
END $$;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "assistantKeyId" TEXT,
ADD COLUMN IF NOT EXISTS "assistantKeyName" TEXT,
ADD COLUMN IF NOT EXISTS "assistantOrigin" "AssistantOrigin";

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_assistantKeyId_fkey') THEN
        ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_assistantKeyId_fkey" FOREIGN KEY ("assistantKeyId") REFERENCES "PersonalKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
