-- mcp-server T25, T35 (review-2026-10-05 F-02, F-03, G-01; owner decisions): Invoice.issueDate and
-- Invoice.dueDate are calendar days, stored as that day at T00:00:00Z (the column stays timestamp). Until
-- now the editor stored the browser's local-midnight instant (or a time of day), so the day an owner saw
-- depends on their zone. This backfills each existing value to the calendar day the owner saw: the
-- instant read in the owner's saved zone (User.timeZone).
--
-- Lazy: User.timeZone ships in the same release with no backfill, so on a first run almost every zone is
-- NULL. Only rows whose owner has a saved zone that pg_timezone_names knows are converted; there is no
-- UTC fallback, because reading a Kyiv local-midnight value in UTC would move it to the day before and
-- the original instant could not be recovered. Rows of an owner with a NULL or unknown zone stay exactly
-- as they are and are read as their UTC day until the zone is first saved; at that moment the application
-- converts that Freelancer's legacy values in the same transaction (lib/services/_shared/invoice-calendar-days.ts,
-- the same expression as below).
--
-- Idempotent: a value already at exactly 00:00:00 UTC is a stored day (written by this release, or a
-- date-only value), so it is left alone; every other value is converted, and its result is a midnight, so a
-- second run changes nothing. A zone west of UTC would otherwise move a stored day to the day before.
-- A data change only (no DDL, no lock beyond the row updates); the previous build reads the new values
-- as instants at UTC midnight, so the release is rollback-safe. The down script cannot restore the old
-- instants and is a no-op.

WITH owner_zone AS (
    SELECT i."id", z."name" AS "zone"
    FROM "Invoice" i
    JOIN "SenderProfile" sp ON sp."id" = i."senderProfileId"
    JOIN "User" u ON u."id" = sp."userId"
    JOIN (SELECT DISTINCT "name" FROM pg_timezone_names) z ON z."name" = u."timeZone"
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
