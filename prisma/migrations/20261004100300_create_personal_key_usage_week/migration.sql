-- mcp-server (spec §6.1, §7; SAD §7, §8 Observability). Weekly per-key usage counts for the KPIs:
-- counts only, never request content. One row per key per UTC ISO week (weekStart = Monday 00:00 UTC).
-- New table only: the previous build ignores it, so the release is rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the PersonalKeyUsageWeek model in data-model.md, made idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PersonalKeyUsageWeek" (
    "personalKeyId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "assistantErrors" INTEGER NOT NULL DEFAULT 0,

    -- flows 6-11: the per-call upsert on (key, week); the prefix serves the FK cascade and the export (flow 14)
    CONSTRAINT "PersonalKeyUsageWeek_pkey" PRIMARY KEY ("personalKeyId","weekStart")
);

-- AddForeignKey (revoked keys keep their history; account deletion cascades through PersonalKey, AC-26)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PersonalKeyUsageWeek_personalKeyId_fkey') THEN
        ALTER TABLE "PersonalKeyUsageWeek" ADD CONSTRAINT "PersonalKeyUsageWeek_personalKeyId_fkey" FOREIGN KEY ("personalKeyId") REFERENCES "PersonalKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
