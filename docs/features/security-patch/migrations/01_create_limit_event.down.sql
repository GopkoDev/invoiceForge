-- Reverts 01: drops the event log (its indexes and FK go with it), then its enum types.
-- Limit records are ephemeral (kept <= 24 h, spec §6.1), nothing to preserve.
DROP TABLE IF EXISTS "LimitEvent";
DROP TYPE IF EXISTS "LimitOutcome";
DROP TYPE IF EXISTS "LimitScope";
