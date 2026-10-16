-- Reverses 06. PostgreSQL cannot drop an enum value, so each type is rebuilt without it.
-- Precondition: run 08.down and 07.down first; rows still using FORM are mapped back (kind -> CUSTOMER is NOT safe,
-- so FORM offers are deleted with their state; FORM messages fall back to TYPED). Review before running.
DELETE FROM "ChoiceOffer" WHERE "kind" = 'FORM';
UPDATE "ConversationMessage" SET "origin" = 'TYPED' WHERE "origin" = 'FORM';

ALTER TYPE "ChoiceOfferKind" RENAME TO "ChoiceOfferKind_old";
CREATE TYPE "ChoiceOfferKind" AS ENUM ('CUSTOMER', 'SENDER_PROFILE', 'CURRENCY', 'BANK_ACCOUNT', 'PRODUCT');
ALTER TABLE "ChoiceOffer" ALTER COLUMN "kind" TYPE "ChoiceOfferKind" USING ("kind"::text::"ChoiceOfferKind");
DROP TYPE "ChoiceOfferKind_old";

ALTER TYPE "MessageOrigin" RENAME TO "MessageOrigin_old";
CREATE TYPE "MessageOrigin" AS ENUM ('TYPED', 'PRESSED', 'DASHBOARD');
ALTER TABLE "ConversationMessage" ALTER COLUMN "origin" TYPE "MessageOrigin" USING ("origin"::text::"MessageOrigin");
DROP TYPE "MessageOrigin_old";
