-- Reverts 04: drops the weekly usage table (its PK and FK go with it). KPI history is lost.
DROP TABLE IF EXISTS "PersonalKeyUsageWeek";
