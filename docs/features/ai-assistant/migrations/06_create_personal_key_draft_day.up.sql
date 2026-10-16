-- ai-assistant (ADR-0009; AC-27, AC-28; SAD §6 flows 3 and 10). Per-key daily draft limit: one counter row per key
-- per local day. A draft takes a slot with a conditional increment (created < allowance) in the invoice's transaction;
-- a lift adds 50 to allowance only when created has reached it. Counter table: no createdAt/updatedAt.
-- New table only: rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PersonalKeyDraftDay" (
    "personalKeyId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "allowance" INTEGER NOT NULL DEFAULT 50,
    "lastLiftedAt" TIMESTAMP(3),

    -- flows 3 and 10: take a slot, lift, show today's count on (key, day); the prefix serves the FK cascade and the export
    CONSTRAINT "PersonalKeyDraftDay_pkey" PRIMARY KEY ("personalKeyId","day")
);

-- flow 9: the 400-day purge
CREATE INDEX IF NOT EXISTS "PersonalKeyDraftDay_day_idx" ON "PersonalKeyDraftDay"("day");

-- AddForeignKey (revoked keys keep their counts; account deletion cascades through PersonalKey)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PersonalKeyDraftDay_personalKeyId_fkey') THEN
        ALTER TABLE "PersonalKeyDraftDay" ADD CONSTRAINT "PersonalKeyDraftDay_personalKeyId_fkey" FOREIGN KEY ("personalKeyId") REFERENCES "PersonalKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
