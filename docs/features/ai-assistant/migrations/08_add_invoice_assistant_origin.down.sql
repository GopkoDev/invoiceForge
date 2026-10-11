-- Reverts 08. Run after 10 is reverted. The origin of every Assistant draft is lost, and with it the issue-rate KPI history.
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_assistantKeyId_fkey";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "assistantOrigin",
DROP COLUMN IF EXISTS "assistantKeyName",
DROP COLUMN IF EXISTS "assistantKeyId";
DROP TYPE IF EXISTS "AssistantOrigin";
