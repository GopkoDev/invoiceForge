-- ai-chat-v2 (ADR-0007; SAD §6 Critical flow 2, §7 Monitoring "Drafts issued from the chat"). Write-once flag set
-- by issueFromPreview in the same locked write that moves the draft out of DRAFT; never cleared, never copied by
-- duplicate. Write-once is a service rule (the repo uses no triggers), as for issuedAt and assistantOrigin.
-- NOT NULL with a constant DEFAULT is catalog-only in PostgreSQL 11+. Existing invoices read false (none was issued
-- from the chat). No index: KPI reads only.
-- The optimistic-concurrency column the issue path checks (expectedVersion) already exists: "Invoice"."version"
-- (20261007100000_add_invoice_version), so no change is needed for ADR-0007's guard.
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "issuedFromChat" BOOLEAN NOT NULL DEFAULT false;
