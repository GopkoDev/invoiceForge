-- ai-assistant (ADR-0007; SAD §6 flows 2 and 6). Draft cards stored server-side: the stored request is re-resolved
-- at every Create press, and only a LIVE card can create a Draft invoice. One LIVE card per Conversation is held by
-- a partial unique index (previewFeatures "partialIndexes", as SenderProfile_userId_isDefault_key).
-- New table only: rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DraftCardState') THEN
        CREATE TYPE "DraftCardState" AS ENUM ('LIVE', 'REPLACED', 'OUTDATED', 'CREATED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DraftCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "state" "DraftCardState" NOT NULL DEFAULT 'LIVE',
    "request" JSONB NOT NULL,
    "proposal" JSONB NOT NULL,
    "replacedById" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftCard_pkey" PRIMARY KEY ("id")
);

-- FK indexes: Conversation delete cascade (flow 8), account deletion (flow 12), replaced-card SET NULL, invoice delete SET NULL
CREATE INDEX IF NOT EXISTS "DraftCard_conversationId_idx" ON "DraftCard"("conversationId");
CREATE INDEX IF NOT EXISTS "DraftCard_userId_idx" ON "DraftCard"("userId");
CREATE INDEX IF NOT EXISTS "DraftCard_replacedById_idx" ON "DraftCard"("replacedById");
CREATE INDEX IF NOT EXISTS "DraftCard_invoiceId_idx" ON "DraftCard"("invoiceId");

-- flow 6: at most one LIVE card per Conversation; the service marks the old card first, then inserts the new one
CREATE UNIQUE INDEX IF NOT EXISTS "DraftCard_conversationId_live_key" ON "DraftCard"("conversationId") WHERE ("state" = 'LIVE');

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DraftCard_userId_fkey') THEN
        ALTER TABLE "DraftCard" ADD CONSTRAINT "DraftCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DraftCard_conversationId_fkey') THEN
        ALTER TABLE "DraftCard" ADD CONSTRAINT "DraftCard_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DraftCard_replacedById_fkey') THEN
        ALTER TABLE "DraftCard" ADD CONSTRAINT "DraftCard_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "DraftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey (AC-37: deleting a Conversation never touches the drafts; deleting a draft leaves a CREATED card with no link)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DraftCard_invoiceId_fkey') THEN
        ALTER TABLE "DraftCard" ADD CONSTRAINT "DraftCard_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
