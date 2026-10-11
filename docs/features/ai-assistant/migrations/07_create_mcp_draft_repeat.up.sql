-- ai-assistant (ADR-0012; AC-32; SAD §6 flows 3 and 9). MCP repeat marks: a repeat within 24 hours returns the first
-- draft, the same mark with other content is refused. Written in the invoice's transaction; purged daily after 24 h.
-- Concurrent repeats collide on the primary key; the loser returns the winner's draft.
-- New table only: rollback-safe without a DB rollback.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "McpDraftRepeat" (
    "personalKeyId" TEXT NOT NULL,
    "repeatKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- flow 3: the repeat lookup and the race backstop on (key, repeat key); the prefix serves the FK cascade
    CONSTRAINT "McpDraftRepeat_pkey" PRIMARY KEY ("personalKeyId","repeatKey")
);

-- FK index: invoice delete SET NULL ("the draft is no longer available", ADR-0012)
CREATE INDEX IF NOT EXISTS "McpDraftRepeat_invoiceId_idx" ON "McpDraftRepeat"("invoiceId");

-- flow 9: the 24-hour purge
CREATE INDEX IF NOT EXISTS "McpDraftRepeat_createdAt_idx" ON "McpDraftRepeat"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'McpDraftRepeat_personalKeyId_fkey') THEN
        ALTER TABLE "McpDraftRepeat" ADD CONSTRAINT "McpDraftRepeat_personalKeyId_fkey" FOREIGN KEY ("personalKeyId") REFERENCES "PersonalKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'McpDraftRepeat_invoiceId_fkey') THEN
        ALTER TABLE "McpDraftRepeat" ADD CONSTRAINT "McpDraftRepeat_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
