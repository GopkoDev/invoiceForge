-- Reverts 01. Saved zones are lost; the app falls back to UTC (or the previous build's cookie).
ALTER TABLE "User" DROP COLUMN IF EXISTS "timeZone";
