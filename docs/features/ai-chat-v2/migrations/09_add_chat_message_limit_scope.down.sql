-- Reverses 09. PostgreSQL cannot drop an enum value, so the type is rebuilt without it.
-- Rows with scope CHAT_MESSAGE are deleted first (they are per-minute counters, kept 24 h at most).
DELETE FROM "LimitEvent" WHERE "scope" = 'CHAT_MESSAGE';

ALTER TYPE "LimitScope" RENAME TO "LimitScope_old";
CREATE TYPE "LimitScope" AS ENUM ('SIGNIN_SOURCE', 'SIGNIN_ADDRESS', 'EXPORT', 'MCP_KEY', 'MCP_SOURCE');
ALTER TABLE "LimitEvent" ALTER COLUMN "scope" TYPE "LimitScope" USING ("scope"::text::"LimitScope");
DROP TYPE "LimitScope_old";
