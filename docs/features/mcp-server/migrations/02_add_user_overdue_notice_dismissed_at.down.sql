-- Reverts 02. Freelancers who dismissed the notice would see it again if the notice code stays deployed.
ALTER TABLE "User" DROP COLUMN IF EXISTS "overdueNoticeDismissedAt";
