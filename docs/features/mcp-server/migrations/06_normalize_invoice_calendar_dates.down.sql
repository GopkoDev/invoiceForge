-- Reverts 06: nothing to do. The backfill replaced each issue/due instant with its calendar day at
-- T00:00:00Z and the old instants are not kept, so they cannot be restored. The previous build reads the
-- new values as instants at UTC midnight. Idempotent by being empty.
SELECT 1;
