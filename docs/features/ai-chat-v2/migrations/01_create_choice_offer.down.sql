-- Reverts 01. Every stored offer (offered and chosen options) is lost; the messages and Draft cards stay.
-- Old replies still carry a data-offer part with the offer id; the previous build ignores that part.
DROP TABLE IF EXISTS "ChoiceOffer";
DROP TYPE IF EXISTS "ChoiceOfferState";
DROP TYPE IF EXISTS "ChoiceOfferKind";
