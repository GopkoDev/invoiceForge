-- Reverses 07. Free-question forms (request NULL) cannot exist in the old shape and are deleted first.
DELETE FROM "ChoiceOffer" WHERE "request" IS NULL;
ALTER TABLE "ChoiceOffer" ALTER COLUMN "request" SET NOT NULL;
ALTER TABLE "ChoiceOffer" DROP COLUMN IF EXISTS "answers";
ALTER TABLE "ChoiceOffer" DROP COLUMN IF EXISTS "questions";
