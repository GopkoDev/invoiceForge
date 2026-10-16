# Data-model audit — ai-chat-v2 revision (2026-10-13)

- **Mode:** brownfield delta (owner feedback, ADR-0011). No DB command was run.
- **Staged (not in the live tree):** `docs/features/ai-chat-v2/migrations/06_add_form_enum_values.{up,down}.sql`, `07_add_choice_offer_form_columns.{up,down}.sql`, `08_backfill_choice_offer_questions.{up,down}.sql`. `implement` promotes them.
- **Promote-time hint:** the live tree is timestamped (`prisma/migrations/YYYYMMDDHHMMSS_<name>`); the latest is `20261013104000_add_invoice_issued_from_chat`, so the next ≈ `20261013105000_add_form_enum_values`, `…106000_…`, `…107000_…` — `implement` assigns the real timestamps.
- **Self-check:** naming follows the repo (quoted PascalCase, camelCase, Prisma default names) ✓; every up has a down (enum value removal via type rebuild; DROP NOT NULL reversed after deleting NULL rows) ✓; no new FK, so no new FK index ✓; conventions (no CHECK, JSONB shapes owned by zod, idempotent DDL) ✓.
- **Breaking-change decomposition:** none dropped or renamed. `options` / `lineIndex` / `chosenOptionId` become legacy (contract-phase drop deferred beyond this feature).
- **Lossy downs (reviewed):** 06.down deletes `FORM` offers and maps `FORM` messages to `TYPED`; 07.down deletes free-question forms. Acceptable for a pre-release rollback; stated in the files.
- **Drift:** not re-run against the domain layer; the T02 promotion is the current baseline. `implement` must add the new enum members to every exhaustive switch over `ChoiceOfferKind` and `MessageOrigin`.
- **TBD:** none.
