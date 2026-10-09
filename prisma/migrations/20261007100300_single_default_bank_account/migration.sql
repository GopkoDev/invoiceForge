-- invoice-integrity (ADR-0005, AC-17, AC-17b, AC-18). At most one default BankAccount per SenderProfile, guaranteed by
-- the database; "at least one" stays a service rule under the SenderProfile row lock.
--
-- Same shape as 03: repair and index in one explicit transaction, behind a table lock against the previous build.
-- Repair (AC-18), earliest-created wins, ties broken by id:
--   1. where a sender profile has several default accounts, only the earliest-created of them stays the default;
--   2. where a sender profile has accounts but no default, its earliest-created account becomes the default.
-- Only "isDefault" changes ("updatedAt" untouched, AC-18). Re-running is a no-op.
-- The index matches Prisma's output for @@unique([senderProfileId], map: "BankAccount_senderProfileId_isDefault_key",
-- where: { isDefault: true }) (previewFeatures "partialIndexes"), so migrate diff sees no drift.

BEGIN;

LOCK TABLE "BankAccount" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "BankAccount" AS ba
SET "isDefault" = false
FROM (
    SELECT "id", row_number() OVER (PARTITION BY "senderProfileId" ORDER BY "createdAt", "id") AS "rn"
    FROM "BankAccount"
    WHERE "isDefault" = true
) AS ranked
WHERE ba."id" = ranked."id"
  AND ranked."rn" > 1;

UPDATE "BankAccount" AS ba
SET "isDefault" = true
WHERE ba."id" IN (
    SELECT DISTINCT ON (a."senderProfileId") a."id"
    FROM "BankAccount" a
    WHERE NOT EXISTS (
        SELECT 1 FROM "BankAccount" d WHERE d."senderProfileId" = a."senderProfileId" AND d."isDefault" = true
    )
    ORDER BY a."senderProfileId", a."createdAt", a."id"
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_senderProfileId_isDefault_key" ON "BankAccount"("senderProfileId") WHERE ("isDefault" = true);

COMMIT;
