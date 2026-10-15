-- ai-chat-v2 revision 2026-10-13 (ADR-0011). A ChoiceOffer row now holds a Question form:
--   questions: 1..6 frozen questions { questionId, field, lineIndex, heading, prompt, options[0..8], input, required,
--              skippable, matchCount, source } (shape owned by the assistant-drafts zod schema, not the DB)
--   answers:   the answers sent with the form, set together with state CHOSEN, cleared on release; NULL otherwise
--   request:   becomes nullable — a free-question form continues no draft request
-- Nullable columns and DROP NOT NULL are catalog-only (no rewrite). The previous build never reads them.
ALTER TABLE "ChoiceOffer" ADD COLUMN IF NOT EXISTS "questions" JSONB;
ALTER TABLE "ChoiceOffer" ADD COLUMN IF NOT EXISTS "answers" JSONB;
ALTER TABLE "ChoiceOffer" ALTER COLUMN "request" DROP NOT NULL;
