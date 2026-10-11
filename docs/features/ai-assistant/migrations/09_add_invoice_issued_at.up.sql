-- ai-assistant (ADR-0013; spec §7 north-star KPI; SAD §6 flow 11). When an invoice first left DRAFT, written once by the
-- status service (SET "issuedAt" = now WHERE "issuedAt" IS NULL). No backfill: the schema never recorded this time,
-- and the KPI only measures Assistant drafts created after the release (owner, sequences 2026-10-11).
-- A nullable column: catalog-only. The previous build never writes it, so an invoice issued by the previous build
-- during the release keeps NULL; the KPI then counts it as not issued (accepted).
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3);
