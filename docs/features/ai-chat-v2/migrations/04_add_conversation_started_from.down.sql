-- Reverts 04. Every Conversation's start point is lost, and with it the dashboard-start KPI history.
ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "startedFrom";
DROP TYPE IF EXISTS "ConversationStartPoint";
