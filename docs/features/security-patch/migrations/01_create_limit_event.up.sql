-- security-patch (ADR-0002, ADR-0005, ADR-0007). Event log for the sign-in-email and export limits:
-- one row per counted or refused event, checked and recorded under a per-key advisory lock.
-- New types and table only: the previous build ignores them, so the release is rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the LimitEvent model in data-model.md, made idempotent.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LimitScope') THEN
        CREATE TYPE "LimitScope" AS ENUM ('SIGNIN_SOURCE', 'SIGNIN_ADDRESS', 'EXPORT');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LimitOutcome') THEN
        CREATE TYPE "LimitOutcome" AS ENUM ('REQUESTED', 'SENT', 'REFUSED', 'ALERTED', 'STARTED', 'FAILED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LimitEvent" (
    "id" TEXT NOT NULL,
    "scope" "LimitScope" NOT NULL,
    "key" TEXT NOT NULL,
    "outcome" "LimitOutcome" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "LimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (flows 1 and 6: count per scope + key inside the window, oldest counted start for "export again at", refusal-per-UTC-hour lookups)
-- Plain CREATE INDEX is fine: the table is created empty in this same migration.
CREATE INDEX IF NOT EXISTS "LimitEvent_scope_key_at_idx" ON "LimitEvent"("scope", "key", "at");

-- CreateIndex (flow 10 + ADR-0007: the global 24 h sweep and the bounded opportunistic purge on every write)
CREATE INDEX IF NOT EXISTS "LimitEvent_at_idx" ON "LimitEvent"("at");

-- CreateIndex (FK index: the User delete cascade, ADR-0007 account deletion)
CREATE INDEX IF NOT EXISTS "LimitEvent_userId_idx" ON "LimitEvent"("userId");

-- AddForeignKey (account deletion cascades the export rows, ADR-0007)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LimitEvent_userId_fkey') THEN
        ALTER TABLE "LimitEvent" ADD CONSTRAINT "LimitEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
