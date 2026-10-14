---
slug: ai-chat-v2
date: 2026-10-14
triage: gap
acs: [AC-54, AC-55, AC-56, AC-08, AC-09, AC-37, AC-40, AC-29, AC-30, AC-31, AC-32]
commit: 1b91901a, 1e712474, 834ca666, 4b0cc9c4, b5b6741a, b4a4210f, 379fb6b1
recurrence_of: none
---

# Fix: the Question form asked for records as free text, looked unlike a question UI, and the dashboard AI block looked poor

## Symptom

Owner, 2026-10-14 (screenshot `ref/form-as-built.png`): writing "давай створимо інвойс", the reply's form asked CUSTOMER and PRODUCT as free-text inputs ("11", "23" typed) instead of offering the Freelancer's Customers and products; the form was a large card of all questions in the message stream with English field headings in a Ukrainian chat. Wanted: Claude's question UI (`ref/form-wanted-claude.png`, `ref/form-wanted-series.png`, `ref/form-wanted-pager.png`). Separately the dashboard "Ask AI" block "looks bad" and is to be removed. Scope: all Freelancers, since the 2026-10-13 form revision.

## Root cause

- The model called `ask_user` for record fields without `recordIds` (it had not called `list_customers` first). ADR-0011 allowed that and `checkAskUser` then built an input-only question (`lib/services/assistant-drafts/forms.ts`, no options when `ids.length === 0`); nothing in code guaranteed real options. The spec (AC-09/AC-37) described only the case where the chat named the records — a **gap**.
- The form layout (SCR-04 revision 2026-10-13) specified all questions at once inline in the reply with field headings; the owner's expectation (one at a time, docked, numbered rows) was not in the spec — a **gap / product change**.
- Field headings were fixed English app text (`form-headings.ts`), shown in every language.

## The pinning test

- T78 (integration): `tests/integration/services/assistant-drafts/fill-record-options.test.ts`, `tests/integration/ai-chat-v2-fill-options-turn.test.ts`; unit `tests/unit/form-language-detail-t78.test.ts`. RED: `expected [] to deeply equal [ 'cmv7b1v3c000552uqbbcgnacj', …(1) ]` (the turn stored a Customer question with no options); `expected undefined to be type of 'function'` (`fillRecordOptions`).
- T79 (component): `tests/component/question-form.test.tsx`, `tests/component/question-form-in-chat.test.tsx`. RED: `expected null not to be null` (`[data-slot="question-dock"]` missing); `Unable to find an accessible element with the role "button" and name "Next question"`; `expected "vi.fn()" to be called 1 times, but got 0 times` (send after the last answer).
- T80 (unit): `tests/unit/dashboard-no-ai-block-t80.test.ts`. RED: `expected 'import { unwrapPageResult } from '@/…' not to match /AiBlockSection/`.

## Spec patch

(c) gap, owner-confirmed (decisions relayed by the coordinator, 2026-10-14):
- New AC-54 (server-filled record options with a detail line), AC-55 (one question at a time, docked above the composer, pager, numbered rows, keyboard, "Something else", Skip, last answer sends once), AC-56 (no field headings; English chrome; dates/amounts in the app's formats; sent message "<question> — <answer>"), each `<!-- added-by-fix: 2026-10-14 -->`.
- AC-08, AC-09, AC-37, AC-40 got "Amended 2026-10-14" notes; AC-29, AC-31, AC-32 marked removed by owner, AC-30 trimmed to the header's "Create invoice with AI"; NFR accessibility row updated.
- ADR-0011 "Amended 2026-10-14"; screens.md SCR-04 superseded-layout note and SCR-09 removal note.
- A first owner request for Ukrainian labels (item 3) was withdrawn by the owner mid-fix and replaced by "no headings, English chrome"; no language detection ships.

## Follow-ups

- ~~`listLatestConversations` unused~~ — removed in b4a4210f (review R8).
- The request schema still accepts origin `DASHBOARD` / `DASHBOARD_PROMPT` (kept for history and pinned by contract tests); no client writes them any more.

## Review and gate (2026-10-14)

One `sdd:reviewer` (opus) pass over `ca75df88..834ca666`: R1 high (a failed option fill hung the turn), R2–R4 medium (× while sending hid 400/409 errors; focus not managed on advance; export shape vs contract), R5–R8 low (contract/data-model `detail`, uncommitted fix record, AC-37 wording, dashboard leftovers). All fixed (T81, T82, docs 21103379), re-check: **REVIEW_CLEAN**. The full e2e then found one axe colour-contrast violation on the "Something else" row (T83, fixed; `accessibility.spec.ts` 6/6).

| Gate | Result |
|---|---|
| Unit (`vitest.config.ts`) | 299 files, 3300 passed |
| Integration (testcontainers) | 156 files, 1614 passed, 61 skipped; the one red (export, mid-fix) green on re-run with the T81 files: 7 files, 33 passed |
| Lint / tsc | 0 errors (4 warnings outside the feature) / clean |
| Full e2e (`CI=1`, macOS, caffeinate) | 160 passed, 7 skipped, 1 failed (contrast) → fixed in T83, `accessibility.spec.ts` 6/6 |
| Linux baselines (pwbrowser v1.63.0-noble) | retaken: `ai-v2-question-form-open`, `ai-v2-question-form-sent`, `ai-v2-form-open-aligned`; all 13 screenshot tests match |
