-- Reverts 05. Keys created with Draft permission become indistinguishable from read-only keys; revoke them first if
-- the feature is rolled back for good, since a later re-up would make them read-only (false) anyway.
ALTER TABLE "PersonalKey" DROP COLUMN IF EXISTS "canCreateDrafts";
