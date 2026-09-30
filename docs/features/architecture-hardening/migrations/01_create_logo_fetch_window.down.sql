-- Reverts 01: drops the counter table (its FK goes with it). Counter data is ephemeral, nothing to preserve.
DROP TABLE IF EXISTS "LogoFetchWindow";
