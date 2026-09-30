-- Wave 4 (contract; ADR-0004 "replacing the exact-match unique"). PROMOTE ONLY AFTER 05 IS APPLIED.
-- Once every row has a non-null normalized key, the key unique makes the exact-match unique redundant
-- (equal numbers always have equal keys). While any key may be NULL, the exact unique is still the only guard
-- on those rows, so it is kept through wave 2.
-- MUST stay the only statement in its migration (CONCURRENTLY).

DROP INDEX CONCURRENTLY IF EXISTS "Invoice_senderProfileId_invoiceNumber_key";
