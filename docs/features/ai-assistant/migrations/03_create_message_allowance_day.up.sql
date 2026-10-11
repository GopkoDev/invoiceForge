-- ai-assistant (ADR-0009; SAD §6 flows 1, 4, 5). Daily message allowance: one counter row per Freelancer per local day.
-- A message reserves a slot with a conditional increment and gives it back on a system-side failure.
-- Counter table: no createdAt/updatedAt, as LogoFetchWindow and PersonalKeyUsageWeek.
-- New table only: rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "MessageAllowanceDay" (
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "timeZone" TEXT NOT NULL,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,

    -- flows 1, 4, 5: reserve, release and "N left today" on (Freelancer, day); the prefix serves the FK cascade and the export
    CONSTRAINT "MessageAllowanceDay_pkey" PRIMARY KEY ("userId","day")
);

-- flow 9: the 400-day purge
CREATE INDEX IF NOT EXISTS "MessageAllowanceDay_day_idx" ON "MessageAllowanceDay"("day");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageAllowanceDay_userId_fkey') THEN
        ALTER TABLE "MessageAllowanceDay" ADD CONSTRAINT "MessageAllowanceDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
