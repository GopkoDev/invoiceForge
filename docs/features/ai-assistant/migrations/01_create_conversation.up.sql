-- ai-assistant (ADR-0008; SAD §6 flows 1, 4, 5, 7, 8). Conversations and their visible messages: what the
-- Freelancer saw, never raw tool answers. Deleted 90 days after the last message (flow 9) or on request (flow 8).
-- New tables only: the previous build ignores them, so the release is rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConversationMessageRole') THEN
        CREATE TYPE "ConversationMessageRole" AS ENUM ('USER', 'ASSISTANT');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" "ConversationMessageRole" NOT NULL,
    "parts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- flows 4 and 1: the owner's list, newest last message first; the prefix serves the userId FK
CREATE INDEX IF NOT EXISTS "Conversation_userId_lastMessageAt_idx" ON "Conversation"("userId", "lastMessageAt" DESC);

-- flow 9: the 90-day purge by last message time
CREATE INDEX IF NOT EXISTS "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- flows 1 and 7: the latest 40 messages and the whole exchange in order; the prefix serves the FK cascade
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationMessage_conversationId_position_key" ON "ConversationMessage"("conversationId", "position");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_userId_fkey') THEN
        ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConversationMessage_conversationId_fkey') THEN
        ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
