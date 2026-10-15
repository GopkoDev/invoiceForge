-- ai-chat-v2 (ADR-0001, ADR-0002, ADR-0003; SAD §5, §6 Critical flow 1, Flows 6, 7, 11). Offered choices stored
-- server-side, one row per offering reply: kind, line slot, the DraftRequest it continues, the frozen options, and
-- the OPEN -> CHOSEN / CLOSED state. At most one OPEN offer per Conversation is held by a partial unique index
-- (previewFeatures "partialIndexes", as DraftCard_conversationId_live_key).
-- New enums + new table only: the previous build ignores them, so the release is rollback-safe without a DB rollback.
-- The FKs are added while the table is empty (no scan of the referenced tables' rows beyond the catalog check).
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChoiceOfferKind') THEN
        CREATE TYPE "ChoiceOfferKind" AS ENUM ('CUSTOMER', 'SENDER_PROFILE', 'CURRENCY', 'BANK_ACCOUNT', 'PRODUCT');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChoiceOfferState') THEN
        CREATE TYPE "ChoiceOfferState" AS ENUM ('OPEN', 'CHOSEN', 'CLOSED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChoiceOffer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "ChoiceOfferKind" NOT NULL,
    "lineIndex" INTEGER,
    "request" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "state" "ChoiceOfferState" NOT NULL DEFAULT 'OPEN',
    "chosenOptionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoiceOffer_pkey" PRIMARY KEY ("id")
);

-- Flow 7 reopen / Flow 11 export: the offer of each reply; one offer per reply; serves the messageId FK cascade
CREATE UNIQUE INDEX IF NOT EXISTS "ChoiceOffer_messageId_key" ON "ChoiceOffer"("messageId");

-- Flow 7 reopen (offers of a Conversation), Conversation delete and 90-day purge cascade (FK index)
CREATE INDEX IF NOT EXISTS "ChoiceOffer_conversationId_idx" ON "ChoiceOffer"("conversationId");

-- Account deletion cascade (Flow 11, FK index)
CREATE INDEX IF NOT EXISTS "ChoiceOffer_userId_idx" ON "ChoiceOffer"("userId");

-- Critical flow 1 press check + claim, Flows 4/6 close-on-typed-message: the one OPEN offer of a Conversation.
-- The service closes or claims the old OPEN row before inserting the next one (SAD §6 Flags), so this never trips
-- in the happy path; it is the race backstop for two concurrent presses / turns.
CREATE UNIQUE INDEX IF NOT EXISTS "ChoiceOffer_conversationId_open_key" ON "ChoiceOffer"("conversationId") WHERE ("state" = 'OPEN');

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChoiceOffer_userId_fkey') THEN
        ALTER TABLE "ChoiceOffer" ADD CONSTRAINT "ChoiceOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChoiceOffer_conversationId_fkey') THEN
        ALTER TABLE "ChoiceOffer" ADD CONSTRAINT "ChoiceOffer_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChoiceOffer_messageId_fkey') THEN
        ALTER TABLE "ChoiceOffer" ADD CONSTRAINT "ChoiceOffer_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
