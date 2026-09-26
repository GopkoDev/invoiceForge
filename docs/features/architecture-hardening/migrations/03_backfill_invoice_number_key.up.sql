-- Wave 2, step 2 of 3 (backfill; ADR-0004). REVIEW THIS SQL before promotion.
--
-- key = lower(trim(invoiceNumber)), where trim strips leading/trailing whitespace. It must produce exactly
-- what normalizeInvoiceNumber() in lib/actions/invoice-actions/numbering.ts produces (see data-model.md, "Normalization parity").
--
-- ADR-0004 fallback, built in: rows whose normalized number is shared with another invoice in the same sender profile
-- are left NULL. Postgres treats NULLs as distinct, so 04's unique index still builds, and those invoices follow AC-17
-- (viewable, not saveable until renumbered). With 0 duplicate groups (measured on the configured DB 2026-09-26),
-- every row gets a key and uniqueness applies to every invoice at once (spec §1).
-- Idempotent: only NULL keys are touched.

UPDATE "Invoice" AS i
SET "invoiceNumberKey" = lower(regexp_replace(i."invoiceNumber", '^\s+|\s+$', '', 'g'))
WHERE i."invoiceNumberKey" IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "Invoice" AS o
      WHERE o."senderProfileId" = i."senderProfileId"
        AND o."id" <> i."id"
        AND lower(regexp_replace(o."invoiceNumber", '^\s+|\s+$', '', 'g'))
          = lower(regexp_replace(i."invoiceNumber", '^\s+|\s+$', '', 'g'))
  );
