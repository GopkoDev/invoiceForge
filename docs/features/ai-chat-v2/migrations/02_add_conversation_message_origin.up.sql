-- ai-chat-v2 (spec §1 "Where a message came from is saved", AC-34; SAD §5, §7 Monitoring). Each Freelancer message
-- records whether it was TYPED, PRESSED (a valid Offered choice) or sent from the DASHBOARD prompt. Set by the
-- server, never on the client's say-so. ASSISTANT messages keep NULL (no CHECK: the repo uses none; the service and
-- zod own the rule).
-- Nullable column: catalog-only, no rewrite. The previous build never reads it and keeps working.
-- Existing USER rows are backfilled by 03.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageOrigin') THEN
        CREATE TYPE "MessageOrigin" AS ENUM ('TYPED', 'PRESSED', 'DASHBOARD');
    END IF;
END $$;

-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "origin" "MessageOrigin";
