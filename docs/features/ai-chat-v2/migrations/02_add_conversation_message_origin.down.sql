-- Reverts 02 (and with it 03's backfill). Every message's origin is lost, and with it the "choices answered by a
-- button" and "turns per draft" KPI inputs.
ALTER TABLE "ConversationMessage" DROP COLUMN IF EXISTS "origin";
DROP TYPE IF EXISTS "MessageOrigin";
