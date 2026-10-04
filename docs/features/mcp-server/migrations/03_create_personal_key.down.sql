-- Reverts 03: drops the key table (its indexes and FK go with it). Every Personal key stops working.
-- Run 04's down first: PersonalKeyUsageWeek references this table.
DROP TABLE IF EXISTS "PersonalKey";
