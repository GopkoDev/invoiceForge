-- ai-chat-v2 (spec §1, §7 "Conversations started from the dashboard", AC-30, AC-34; SAD §5, §7). Where a
-- Conversation was started: AI_SECTION, INVOICE_LIST, DASHBOARD_PROMPT or DASHBOARD_CREATE. Set from the first
-- message (validated enum, accepted only then) and never changed.
-- NOT NULL with a constant DEFAULT is a catalog-only change in PostgreSQL 11+ (no rewrite, brief lock). Existing
-- Conversations read AI_SECTION, the assumption SAD §7 records for pre-release Conversations, and the previous
-- build's inserts get the default, so no backfill and no contract step are needed.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConversationStartPoint') THEN
        CREATE TYPE "ConversationStartPoint" AS ENUM ('AI_SECTION', 'INVOICE_LIST', 'DASHBOARD_PROMPT', 'DASHBOARD_CREATE');
    END IF;
END $$;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "startedFrom" "ConversationStartPoint" NOT NULL DEFAULT 'AI_SECTION';
