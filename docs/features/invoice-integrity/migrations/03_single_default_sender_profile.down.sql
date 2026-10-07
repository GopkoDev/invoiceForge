-- Reverts 03's index. The default repair is NOT reverted (SAD §7): it only removed duplicate defaults and filled gaps,
-- the old rows are not kept, and the previous build works with exactly one default.
DROP INDEX IF EXISTS "SenderProfile_userId_isDefault_key";
