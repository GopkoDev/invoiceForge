-- mcp-server (ADR-0007). Two new scopes in the existing LimitEvent log:
--   MCP_KEY    — calls that passed the key check, per Personal key (60 in the most recent 60 s, AC-11)
--   MCP_SOURCE — refused key checks, per network source (30 in 5 min)
-- No new outcomes: MCP_KEY counts REQUESTED rows, MCP_SOURCE counts REFUSED rows (data-model.md).
--
-- ADD VALUE IF NOT EXISTS is idempotent. On PostgreSQL 12+ it may run inside the implicit transaction of a
-- multi-statement script, as long as nothing in the same transaction uses the new values — nothing here does.
-- The previous build never queries these scopes, so the release is rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the LimitScope enum in data-model.md, made idempotent.

-- AlterEnum
ALTER TYPE "LimitScope" ADD VALUE IF NOT EXISTS 'MCP_KEY';
ALTER TYPE "LimitScope" ADD VALUE IF NOT EXISTS 'MCP_SOURCE';
