-- ai-chat-v2 (SAD §7 Migrations): Freelancer messages saved before ai-chat-v2 could only be typed, so they get
-- origin TYPED (an assumption recorded for pre-release Conversations). ASSISTANT rows stay NULL.
-- Idempotent: only rows still NULL are touched, so it can be re-run after the code deploy to cover USER rows the
-- previous build wrote between 02 and the deploy. Readers also treat a NULL origin on a USER row as TYPED.
-- One UPDATE over a small table (90-day retention, at most 30 messages a day per Freelancer); row locks only.
-- REVIEW the predicate before promotion.

UPDATE "ConversationMessage"
SET "origin" = 'TYPED'
WHERE "role" = 'USER' AND "origin" IS NULL;
