-- ai-assistant (ADR-0004; SAD §6 flows 1 and 5; spec §7 KPIs). Per-turn metadata, never text.
-- The Conversation reference is set to NULL when the Conversation is deleted, so KPIs survive (SAD §5).
-- New table only: rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssistantTopic') THEN
        CREATE TYPE "AssistantTopic" AS ENUM ('IN_SCOPE', 'MIXED', 'OFF_TOPIC');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssistantTurnOutcome') THEN
        CREATE TYPE "AssistantTurnOutcome" AS ENUM ('ANSWERED', 'CAPPED', 'FAILED', 'ALLOWANCE_USED_UP');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "topic" "AssistantTopic",
    "outcome" "AssistantTurnOutcome" NOT NULL,
    "counted" BOOLEAN NOT NULL,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "toolNames" TEXT[],
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantTurn_pkey" PRIMARY KEY ("id")
);

-- FK indexes: account deletion (flow 12) and the SET NULL on Conversation delete (flow 8)
CREATE INDEX IF NOT EXISTS "AssistantTurn_userId_idx" ON "AssistantTurn"("userId");
CREATE INDEX IF NOT EXISTS "AssistantTurn_conversationId_idx" ON "AssistantTurn"("conversationId");

-- flow 9: the 400-day purge; also the weekly KPI windows
CREATE INDEX IF NOT EXISTS "AssistantTurn_createdAt_idx" ON "AssistantTurn"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantTurn_userId_fkey') THEN
        ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssistantTurn_conversationId_fkey') THEN
        ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
