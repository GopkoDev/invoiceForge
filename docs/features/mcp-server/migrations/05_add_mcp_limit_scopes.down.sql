-- Reverts 05. PostgreSQL cannot drop an enum value, so the type is rebuilt without the two scopes
-- (the same shape `prisma migrate diff` emits for a removed enum value).
-- Deletes the MCP limit rows first: they are ephemeral (kept <= 24 h, spec §6.1), nothing to preserve.
-- Rewrites LimitEvent under an ACCESS EXCLUSIVE lock; fine for a log purged daily.
-- Idempotent: does nothing once MCP_KEY is gone.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'LimitScope' AND e.enumlabel IN ('MCP_KEY', 'MCP_SOURCE')
    ) THEN
        DELETE FROM "LimitEvent" WHERE "scope"::text IN ('MCP_KEY', 'MCP_SOURCE');
        ALTER TYPE "LimitScope" RENAME TO "LimitScope_old";
        CREATE TYPE "LimitScope" AS ENUM ('SIGNIN_SOURCE', 'SIGNIN_ADDRESS', 'EXPORT');
        ALTER TABLE "LimitEvent" ALTER COLUMN "scope" TYPE "LimitScope" USING ("scope"::text::"LimitScope");
        DROP TYPE "LimitScope_old";
    END IF;
END $$;
