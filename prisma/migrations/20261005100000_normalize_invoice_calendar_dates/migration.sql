-- mcp-server T25 (review-2026-10-05 F-02, F-03; owner decision): Invoice.issueDate and Invoice.dueDate
-- are calendar days, stored as that day at T00:00:00Z (the column stays timestamp). Until now the editor
-- stored the browser's local-midnight instant (or a time of day), so the day an owner saw depends on
-- their zone. This backfills each existing value to the calendar day the owner saw: the instant read in
-- the owner's saved zone (User.timeZone, UTC when none or not a zone PostgreSQL knows).
--
-- Idempotent: a value already at exactly 00:00:00 UTC is a stored day (written by this release, or a
-- date-only value), so it is left alone; every other value is converted, and its result is a midnight, so a
-- second run changes nothing. A zone west of UTC would otherwise move a stored day to the day before.
-- A data change only (no DDL, no lock beyond the row updates); the previous build reads the new values
-- as instants at UTC midnight, so the release is rollback-safe. The down script cannot restore the old
-- instants and is a no-op.

WITH owner_zone AS (
    SELECT
        i."id",
        COALESCE(
            (SELECT z."name" FROM pg_timezone_names z WHERE z."name" = u."timeZone" LIMIT 1),
            'UTC'
        ) AS "zone"
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    JOIN "User" u ON u."id" = sp."userId"
)
UPDATE "Invoice" AS i
SET
    "issueDate" = CASE
        WHEN i."issueDate" = date_trunc('day', i."issueDate") THEN i."issueDate"
        ELSE ((i."issueDate" AT TIME ZONE 'UTC') AT TIME ZONE oz."zone")::date::timestamp
    END,
    "dueDate" = CASE
        WHEN i."dueDate" = date_trunc('day', i."dueDate") THEN i."dueDate"
        ELSE ((i."dueDate" AT TIME ZONE 'UTC') AT TIME ZONE oz."zone")::date::timestamp
    END
FROM owner_zone oz
WHERE oz."id" = i."id"
  AND (i."issueDate" <> date_trunc('day', i."issueDate") OR i."dueDate" <> date_trunc('day', i."dueDate"));
