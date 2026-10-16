# T133 — AC-14 count in words accepted; folded own-profile row recorded as a known limitation

- **Layer:** eval + docs
- **Deps:** T132
- **AC:** AC-14, AC-05b
- **Source:** fifth Haiku evaluation and owner decision, 2026-10-16

## Definition of done

Fifth Haiku eval (2026-10-16, one run, after T130-T132): Topic PASS; no-guessing 38/40, 0 ungrounded; failing AC-05b-own-profile-folded (known model limitation, T130 revision) and AC-14-many-studios ('Twelve Customers match "Studio"', the count in words, 4 runs in a row). Owner decision 2026-10-16: a count written in words counts as saying how many match; the folded row is a known limitation. (1) evals/assistant/score.ts matchCountFailures: 'says how many match' passes on /\b12\b/ or the number word (en /\btwelve\b/i, uk /дванадцят/i). Unit tests: 'Twelve Customers match "Studio"' and 'Дванадцять клієнтів відповідають «Studio»' pass; a reply with no count still fails; listing a Studio name still fails. (2) docs/features/ai-chat-v2/test-plan.md: one sentence where AC-14's evaluation rule is described recording the owner decision; one sentence recording AC-05b-own-profile-folded as a known model limitation (Haiku shortens 'consulting  fop' to 'fop'; the own-profile hint stays exact-only by design). (3) docs/features/ai-chat-v2/_ship/pr-body.md and _ship/changelog.md: the real-model evaluation owner item records the Haiku result (38/40 on 2026-10-16 after T115-T133, topic boundary PASS, 0 ungrounded values) and the known limitation; mark the evaluation item done if the only remaining failure is the known one.
