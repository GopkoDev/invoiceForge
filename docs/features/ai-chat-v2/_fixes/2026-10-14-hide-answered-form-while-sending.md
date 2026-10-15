---
slug: ai-chat-v2
date: 2026-10-14
triage: gap
acs: [AC-55, AC-40]
commit: see SDD-Fix 2026-10-14-hide-answered-form-while-sending
recurrence_of: none
---

# Fix: the answered Question form stayed docked, disabled with "Sending…", while the reply was written

## Symptom

Owner, 2026-10-14: after the Freelancer answers the last question of the docked Question form, the answers message appears in the stream, but the form stays above the composer (disabled, "Sending…") while the model thinks and streams the reply. Wanted: hide it at once. A failed send must bring it back with the answers and the error, as today.

## Root cause

`components/ai/chat-island.tsx` kept the in-flight form docked (`pending={sentFormId === dockFormId}`) so a failed send could show its errors and picks again. AC-55 said nothing about the form during the reply. This is a **gap**.

## The pinning test (T84)

`tests/component/question-form-in-chat.test.tsx`:
- "while the request is in flight … the dock is hidden"
- "ChatIsland - hidden while sending (R2, T82; AC-55)": 400 `form.answers.*`, 409 and network failure each bring the dock back with the picks and the error.
- Two focus tests: focus is never inside the hidden dock, and it lands on the Message box after the reply ends or the send fails.

RED: `expect(element).not.toBeVisible() / Received element is visible: <div class="pb-2" data-slot="question-dock"/>`. The three R2 "× in flight" tests are replaced, because the × can no longer be reached while the answers are in flight. That makes the R2 guarantee (errors are never hidden by ×) structural.

## Fix

- `chat-island.tsx`: the question-dock wrapper gets `hidden` while its form is the one in flight. The `QuestionForm` stays mounted with the same key, so the picks survive a failed send. It gets `pending={false}`, so while hidden it renders nothing focusable. A layout effect blurs focus if it was left inside the hidden dock. The composer's existing busy→ready effect then focuses the Message box.
- Typed sends are unchanged: the form closes as before (AC-40).
- `tests/e2e/ai-chat-v2-forms-layout.spec.ts` AC-40: the DB check now polls until the saved turn has closed the offer. It used to read before save-turn ran and was racy, failing on HEAD too under `--trace on`.

## Spec patch

(c) gap, decided by the owner: AC-55 has an "Amended 2026-10-14" note (`added-by-fix`). The changelog and PR body each have one line.

## Follow-ups

- `QuestionForm`'s `pending` / "Sending…" state is now unused by the chat (the component contract and its unit tests are unchanged). Remove it on the next form change.

## Gate (2026-10-14)

| Gate | Result |
|---|---|
| Unit (`vitest.config.ts`) | 299 files, 3306 passed |
| Lint / tsc | 0 errors (4 warnings outside the feature) / clean |
| e2e (`CI=1`, macOS, caffeinate): ai-chat-v2-forms-layout, ai-chat-v2-chat, accessibility | 29 passed, 2 skipped (Linux-only visual baselines). AC-40 repeat-each 5: 5 passed |
| Linux baselines | not retaken: no screenshot shows the in-flight state |
