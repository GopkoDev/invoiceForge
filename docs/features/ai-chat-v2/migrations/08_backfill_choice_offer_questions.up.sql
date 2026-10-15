-- ai-chat-v2 revision 2026-10-13 (spec §1 F9a; ADR-0011 "Legacy rows"). Every pre-revision offer becomes a
-- one-question form so one reader serves both. Kind keeps its legacy value (it names the question's field);
-- options keep their { optionId, label, ref } shape. Idempotent: only rows with questions IS NULL are touched.
-- Production holds no ChoiceOffer rows before this feature ships; this backfills development data.
UPDATE "ChoiceOffer"
SET "questions" = jsonb_build_array(jsonb_build_object(
        'questionId', 0,
        'field', "kind"::text,
        'lineIndex', "lineIndex",
        'prompt', NULL,
        'options', "options",
        'input', 'NONE',
        'required', true,
        'skippable', false,
        'matchCount', NULL,
        'source', 'RESOLVER')),
    "answers" = CASE WHEN "chosenOptionId" IS NULL THEN NULL
                     ELSE jsonb_build_array(jsonb_build_object('questionId', 0, 'optionId', "chosenOptionId")) END
WHERE "questions" IS NULL;
