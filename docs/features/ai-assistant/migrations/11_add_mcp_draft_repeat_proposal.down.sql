-- Reverts 11. Stored proposals are lost; a repeat then falls back to a rebuild from the stored invoice.
ALTER TABLE "McpDraftRepeat" DROP COLUMN IF EXISTS "proposal";
