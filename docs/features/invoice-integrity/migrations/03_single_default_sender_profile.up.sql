-- invoice-integrity (ADR-0005, AC-17, AC-17b, AC-18). At most one default SenderProfile per Freelancer, guaranteed by
-- the database; "at least one" stays a service rule under the User row lock.
--
-- One file on purpose: the repair and the index run in one explicit transaction (BEGIN/COMMIT, so psql and
-- prisma migrate deploy behave the same). The index is never created over unrepaired rows, and a failure rolls
-- back both (the release then stops before the code deploy, SAD §6 flow 11).
-- The table lock keeps the previous build from writing a second default between the repair and the index.
-- Repair (AC-18), earliest-created wins, ties broken by id:
--   1. where a Freelancer has several defaults, only the earliest-created of them stays the default;
--   2. where a Freelancer has profiles but no default, the earliest-created profile becomes the default.
-- Only "isDefault" changes: "updatedAt" is an application-side @updatedAt and raw SQL leaves it as it was
-- ("nothing else changes", AC-18). Re-running is a no-op: after a first run neither UPDATE matches a row.
-- The index matches Prisma's output for @@unique([userId], map: "SenderProfile_userId_isDefault_key",
-- where: { isDefault: true }) (previewFeatures "partialIndexes"), so migrate diff sees no drift.

BEGIN;

LOCK TABLE "SenderProfile" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "SenderProfile" AS sp
SET "isDefault" = false
FROM (
    SELECT "id", row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt", "id") AS "rn"
    FROM "SenderProfile"
    WHERE "isDefault" = true
) AS ranked
WHERE sp."id" = ranked."id"
  AND ranked."rn" > 1;

UPDATE "SenderProfile" AS sp
SET "isDefault" = true
WHERE sp."id" IN (
    SELECT DISTINCT ON (s."userId") s."id"
    FROM "SenderProfile" s
    WHERE NOT EXISTS (
        SELECT 1 FROM "SenderProfile" d WHERE d."userId" = s."userId" AND d."isDefault" = true
    )
    ORDER BY s."userId", s."createdAt", s."id"
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SenderProfile_userId_isDefault_key" ON "SenderProfile"("userId") WHERE ("isDefault" = true);

COMMIT;
