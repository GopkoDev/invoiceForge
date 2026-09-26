-- Wave 1 (ADR-0008). Sliding-window counter for real logo fetches, one row per Freelancer per one-minute window.
-- New table only: the previous build ignores it, so the release is rollback-safe without a DB rollback.

-- CreateTable
CREATE TABLE IF NOT EXISTS "LogoFetchWindow" (
    "userId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LogoFetchWindow_pkey" PRIMARY KEY ("userId", "windowStart")
);

-- AddForeignKey (account deletion cascades the counter rows, ADR-0007 / ADR-0008)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LogoFetchWindow_userId_fkey') THEN
        ALTER TABLE "LogoFetchWindow" ADD CONSTRAINT "LogoFetchWindow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
