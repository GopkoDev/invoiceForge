-- ai-assistant (ADR-0012; AC-30, AC-32; review-2026-10-12 N-1, N-10). The first answer's DraftProposal, stored on the
-- repeat mark in the invoice's transaction, so a repeat returns it with its true field sources, defaultsUsed and
-- rate sources instead of a rebuild from the invoice.
-- A nullable column: catalog-only. Rows written before this column (and by the previous build during the release)
-- keep NULL; the service then falls back to a rebuild from the stored invoice. No backfill (marks live 24 hours).
-- Body matches `prisma migrate diff` for the models in data-model.md, made idempotent.

-- AlterTable
ALTER TABLE "McpDraftRepeat" ADD COLUMN IF NOT EXISTS "proposal" JSONB;
