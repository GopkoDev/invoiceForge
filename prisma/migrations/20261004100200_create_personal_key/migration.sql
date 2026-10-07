-- mcp-server (ADR-0004; AC-02 to AC-07, AC-25, AC-26). One row per Personal key, active or revoked.
-- The key itself is never stored: only its SHA-256 digest (lower-case hex) and its last four characters.
-- New table only: the previous build ignores it, so the release is rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the PersonalKey model in data-model.md, made idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "PersonalKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeNameKey" TEXT,
    "digest" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "firstSuccessAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (critical flow 1, flows 5 and 15: authenticate a call by the digest of the presented key)
-- Plain CREATE INDEX is fine: the table is created empty in this same migration.
CREATE UNIQUE INDEX IF NOT EXISTS "PersonalKey_digest_key" ON "PersonalKey"("digest");

-- CreateIndex (flow 4 + AC-03: an active name is unique per Freelancer ignoring case — activeNameKey is
-- NULL once revoked, and NULLs never collide. Its userId prefix also serves the FK, the key list (flow 3),
-- the entry-point check (AC-01), the active-key count (AC-04) and the export (flow 14).)
CREATE UNIQUE INDEX IF NOT EXISTS "PersonalKey_userId_activeNameKey_key" ON "PersonalKey"("userId", "activeNameKey");

-- AddForeignKey (account deletion cascades every key, AC-26)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PersonalKey_userId_fkey') THEN
        ALTER TABLE "PersonalKey" ADD CONSTRAINT "PersonalKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
