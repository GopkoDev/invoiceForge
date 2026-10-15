-- Reverses 08: legacy rows return to their pre-revision shape (options and chosenOptionId were never changed).
UPDATE "ChoiceOffer" SET "questions" = NULL, "answers" = NULL WHERE "kind" <> 'FORM';
