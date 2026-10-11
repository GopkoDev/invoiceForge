-- Reverts 01. Run after 02 and 04 are reverted (DraftCard and AssistantTurn reference Conversation).
-- Every Conversation and message is lost; the drafts they created stay (they are invoices).
DROP TABLE IF EXISTS "ConversationMessage";
DROP TABLE IF EXISTS "Conversation";
DROP TYPE IF EXISTS "ConversationMessageRole";
