# Editor UX — feature description

_Source: [`docs/features/editor-ux/_ship/feature.md`](docs/features/editor-ux/_ship/feature.md)_

> This document uses ASD-STE100 Simplified Technical English. The names of the people (Freelancer,
> Customer, Visitor, Contributor), the button names (Save, Save and issue, Retry, Download, Print,
> Try again, Reload) and the status names (draft, issued) are technical names.

## 1. Purpose

The Freelancer uses the invoice editor and the invoice lists each day. A person who examines the product also sees them first. This feature makes them fast, correct and accessible before the public release.

This feature does not change a business rule. The rules of `invoice-integrity` stay the same. The feature changes only how the app loads, shows and announces the data.

## 2. Terms

| Term | Meaning |
|---|---|
| PDF toolkit | The code that makes a PDF. It is large (approximately 1.6 MB). |
| Preview | The panel in the app that shows the invoice as the Customer will see it. |
| First display | The page that the server sends, before the page becomes interactive. |
| Freelancer time zone | The time zone that the Freelancer saved on the account. If there is no saved time zone, the app uses UTC. |
| Calendar day | The issue date or the due date of an invoice. It has no time and no time zone. |
| Phone layout | The editor layout for a screen that is 390 px wide or narrower. |

## 3. Rules

### 3.1 PDF toolkit

Only Download and Print load the PDF toolkit. The dashboard, the lists, the Customer pages and the sender profile pages do not load it.

The app loads the PDF toolkit one time in each visit. After that, Download and Print use the loaded toolkit.

The preview does not use the PDF toolkit.

The editor can load the PDF toolkit after it opens. Thus, Download and Print in the editor seldom wait.

### 3.2 PDF errors

If the connection stops, the app shows the message "the PDF could not be prepared". The message has a Try again button.

If a new version of the app was released after the page opened, the app shows the message "a newer version is available". The message has a Reload button.

If the PDF fails during its generation, the app shows the "could not be prepared" message. The app also sends an error report to the team.

In all of these cases, the page stays usable. Nothing else on the page changes.

### 3.3 Save

You can continue to type while the app saves the invoice.

A change that you make during a save is never lost. The app does not mark this change as saved. The next Save stores it.

The totals on the screen always agree with the lines on the screen. The app calculates them with the same rule as the stored totals.

If you click Save and issue and change a line during the save, the invoice becomes issued with its old lines. A warning tells you that the app did not save your change. You can close the warning.

### 3.4 Retry

If a save fails, the message has a Retry button.

Retry does the same action as the action that failed (Save, or Save and issue). It uses the form as it is when you click Retry.

Retry gives the same result as Save:

- A new invoice gets its own address. If you reload the page, the app opens this invoice.
- If the invoice changed in a different place, the app shows the same dialog as for Save.
- If the totals changed, the app asks you to confirm them, as for Save.

### 3.5 First display

The editor shows the correct invoice on the first display. The data does not change when the page becomes interactive.

A new invoice shows its default values on the first display:

- the default sender profile and its default bank account
- the issue date: today in the Freelancer time zone
- the due date that the payment terms give.

The invoice number can show after the first display. Until then, the field shows that it is loading. The layout does not move when the number shows.

### 3.6 Shared browser

The app does not keep signed-in pages in the browser cache.

If the browser shows a signed-in page again from its back/forward cache, the app hides the page and reloads it.

Thus, after Freelancer A signs out, a Visitor or Freelancer B cannot see the invoices of Freelancer A. This rule also applies when they click Back or Forward.

### 3.7 Dates

Each place shows the issue date and the due date as the calendar day that the invoice stores. The time zone of the Freelancer and the time zone of the browser do not change this day.

The creation date of a custom price shows in the Freelancer time zone.

### 3.8 Money

Each place shows money in one format: for example, "$1,234.50" and "UAH 1,234.50". The language of the device does not change this format.

The preview and the PDF use the same document model. Thus, they always show the same words, dates and amounts.

### 3.9 Amount fields

The price, quantity, discount, tax rate and shipping fields open a numeric keypad.

These fields accept only a point "." as the decimal separator. If you type or paste a comma, the field does not accept it. A note next to the field tells you to use a point.

## 4. What the Freelancer sees

| Place | Change |
|---|---|
| Dashboard and lists | The pages open faster. They do not load the PDF toolkit. |
| Download and Print | The button shows that the PDF is being prepared. Then the PDF downloads or prints. |
| Editor | The correct invoice shows immediately. The totals always agree with the lines. |
| Editor on a phone | The phone layout shows immediately. The form does not move. |
| Screen reader | Each field, error and icon button has a name. A line field also gives its line number, for example "Quantity, line 3". |
| Invoice list row menu | The button gives its action and the invoice number. |

The Contributor sees these changes:

- The repository does not contain unused UI components or their packages.
- The repository has one theme switcher.
- The README steps work as written on a new clone.

## 5. Release procedure

> **NOTE:** This feature has no migration. It does not add a table, a column or an index.

> **NOTE:** This feature has no new required setting and no feature flag.

1. Make sure that the `unit` and `integration` jobs of this pull request are green.
2. Before the release, record the 14-day baselines for these two values:
   - the render-mismatch errors in error tracking
   - the p75 layout shift of the editor at phone width.
3. Merge the pull request. Then, deploy the code.

> **NOTE:** The owner did not do the checks O1 (the decimal keypad on a real iPhone) and O2 (the review of the Linux layout baselines). The owner skipped them on 2026-10-11.

## 6. Rollback procedure

1. Deploy the previous build.

> **NOTE:** The feature stores no new data. You do not have to change the database.

## 7. Checks after the release

1. After 14 days, make sure that the error tracking shows 0 render-mismatch errors from the invoice list, the dashboard and the editor.
2. After 14 days, make sure that the p75 layout shift of the editor at phone width is 0.1 or less.
3. For 90 days, make sure that the accessibility check in CI shows 0 serious or critical violations.

## 8. Related documents

- Specification: [`spec.md`](docs/features/editor-ux/spec.md)
- Architecture: [`sad.md`](docs/features/editor-ux/sad.md)
- Decisions: [`adr/`](docs/features/editor-ux/adr/)
- Data model (no schema change): [`data-model.md`](docs/features/editor-ux/data-model.md)
- Test plan: [`test-plan.md`](docs/features/editor-ux/test-plan.md)
- Changelog: [`changelog.md`](docs/features/editor-ux/_ship/changelog.md)

---

## Summary

The invoice editor and the lists around it are now fast, truthful and accessible, and the repository works as written. Signed-in list pages no longer load the PDF toolkit, a change typed during a save is never lost, Retry behaves exactly like Save, the editor draws the right invoice from the server's first HTML, dates and money look the same everywhere, and the editor works with a screen reader and on a phone. No business rule changes: every `invoice-integrity` acceptance test still passes. See the [spec](docs/features/editor-ux/spec.md) and the [changelog](docs/features/editor-ux/_ship/changelog.md).

> **Owner checks for AC-13 from review r18 — skipped by the owner (2026-10-11):**
> - **O1:** the decimal keypad on a real iPhone in the Ukrainian region (T25) — skipped.
> - **O2:** the owner's review of the Linux layout baselines (T53; `_audit/T53-linux-e2e-2026-10-10.log:219`) — skipped.
>
> **N3:** this PR's green `unit` and `integration` jobs, with the local full e2e run below, are the evidence for the NFRs "PDF toolkit on non-printing pages" and "No regressions" (spec §8).
>
> **CI change at ship (owner decision):** the per-PR `e2e` job and the nightly full e2e workflow added earlier in this branch are removed. CI runs unit, integration, lint, typecheck, audit, `next build` and the PDF chunk check; the full `pnpm test:e2e` runs locally before each ship.

## Acceptance criteria

- AC-01 — non-editor signed-in pages and the preview fetch no PDF toolkit; Download/Print fetch it once per visit ✓
- AC-02 — a dropped connection shows "could not be prepared" with Try again; the page stays usable ✓
- AC-02b — a missing chunk after a release offers Reload; a generation failure offers Try again and is reported ✓
- AC-03 — a quantity changed during Save stays unsaved, the totals include it, the next Save stores it ✓
- AC-04 — on-screen totals always equal the on-screen lines, by the stored-totals rule ✓
- AC-05 — a refused save keeps every typed change on screen, unsaved; nothing is stored ✓
- AC-05b — Save and issue that wins over a mid-save edit warns that the edit was not saved ✓
- AC-05c — Retry repeats the failed action with the current form; a created invoice lands on its own address ✓
- AC-05d — a retried save shows the same changed-elsewhere / totals dialogs as Save; never fails silently ✓
- AC-06 — the editor shows the opened invoice (or the new invoice's defaults) from the first display ✓
- AC-07 — no part of an earlier Freelancer's invoice is ever shown in the same tab, incl. the back/forward cache ✓
- AC-08 — issue and due dates show the stored calendar day everywhere, in every time zone ✓
- AC-09 — the preview, PDF, editor and Debtors use one money format on any device language ✓
- AC-10 — the preview and the PDF show the same issued details, line by line, from one document model ✓
- AC-11 — every editor field and icon button has an announced name ("Quantity, line 3") ✓
- AC-12 — an invalid field is announced as invalid with its error tied to it ✓
- AC-13 — phone layout from the first display; decimal keypad; only "." accepted ✓ in code and tests (O1, O2 skipped by the owner)
- AC-14 — an unfinished "12." keeps its text and focus across a phone/desktop layout switch ✓
- AC-15 — the README setup and test steps work word for word on a fresh clone ✓
- AC-16 — no unused UI component or package, one theme switcher, the save confirmation sits with the editor's dialogs ✓

## Design

- Spec: `docs/features/editor-ux/spec.md`
- Architecture: `docs/features/editor-ux/sad.md`
- Decisions: `docs/features/editor-ux/adr/` (ADR-0001 … ADR-0007)
- Data model: `docs/features/editor-ux/data-model.md` (**no schema change, no migration**)
- UX: `ux-flows.md`; test plan: `test-plan.md`
- Reviews: `_review/review-2026-10-11-r18.md` (CHANGES REQUESTED only for owner actions O1, O2; no code change requested)

## Tasks (SDD-Task trailers)

T1–T105, 153 commits. `git log main..feature/editor-ux --grep SDD-Task`:

<details>
<summary>All 105 tasks</summary>

- T1 d4e6f4d Move the PDF toolkit into one lazy lib/pdf module with a cached, classifying loader
- T2 f8226eb Route every PDF trigger through usePdfAction and warm the toolkit in the editor when idle
- T3 8b24222 Add the build-output PDF chunk check to CI and e2e tests for first PDF, offline and new-version
- T4 bce3e87 Remove the unused UI components and their packages, drop uuid, and keep one theme switcher
- T5 957c40a Mount the editor's confirmation dialog in the invoice-editor modal container
- T6 92362a2 Rewrite the README setup and test steps and verify them in a fresh clone
- T7 483439e Create the lib/format module for money, calendar days and moments with a fixed en-US locale
- T8 2c9df1e Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint
- T9 f039bff Build the pure invoice document model with its wording in lib/invoice-document
- T10 80007ed Lay out the HTML preview and the PDF from the document model and add the parity test
- T11 efc0548 Turn the editor store into a per-mount factory provided by context and built from server data
- T12 86340fc Compute a new invoice's today and due date on the server and reserve the invoice-number field
- T13 b82a9ed Add the store save command with a form revision and resolve every save outcome in it
- T14 5417b19 Route Retry, the created-address change and the save dialogs through the save command
- T15 6e54898 Send signed-in pages no-store, reload back/forward-cache restores, and prove AC-07 in Chromium and WebKit
- T16 b337a53 Give every editor field, line field, icon button and row action an announced name and tie errors to fields
- T17 0002274 Render the editor's phone and desktop layouts from one DOM tree switched by CSS only
- T18 6ed0b1a Add the shared AmountInput with a decimal keypad and use it for line, discount, tax and shipping fields
- T19 46544e0 Add the CI e2e job with the server/browser date matrix and the accessibility suite
- T20 7e5213f, f051ef8 Add e2e tests that reach every save outcome by Save and by Retry and compare the results
- T21 5a28fbd Dispose the editor store on unmount so Retry and an in-flight create cannot act on another page, and remove the unused save-bypassing actions
- T22 31baff1 Open a new invoice with the default sender profile, its default bank account and currency, and request the invoice-number hint on mount
- T23 5a5a6e5 Print an issued invoice with its stored line amounts and totals in the preview and the PDF
- T24 113aea4 Keep the failed intent through the changed-totals confirmation so Save and issue stays Save and issue
- T25 7cd27fb Stop AmountInput from turning a typed comma decimal into a larger amount, and record the iPhone keypad check
- T26 5120dad Name the phone more-actions button and the line product fields, tie the product error to its field, and run axe at phone width and after a refused save
- T27 8831603 Show "Customer since" in the Freelancer time zone
- T28 76352f6 Make every PDF action fail safely, show its preparing state, resist double clicks and popup blockers, and test the real triggers
- T29 bfd4f41 Reword AC-01 and AC-02b for the HTML preview and remove the dead preview PDF action
- T30 ac8c5db Limit Cache-Control no-store to signed-in document and RSC responses
- T31 9d049fd Make the CI e2e job fail instead of skipping without Docker, add a nightly full e2e run, and harden the PDF chunk gate
- T32 57f69ee, d40c9aa Capture Linux layout baselines from main, cover a new invoice, and re-verify the README on a fresh clone including e2e
- T33 3f3cc10 Prove AC-07 by navigating back to the earlier Freelancer's invoice, between two invoices, and by direct address after sign-out
- T33b 8f71d98 Prove AC-07 on a restored (bfcache) page: no-store and the restore guard keep A's invoice off screen
- T34 0549208 Extend the date matrix to the preview, the PDF and a new invoice's today, with hard-coded expectations
- T35 06ba8ff Prove money formatting independent of device language on the screens, and test parity against a really rendered PDF
- T36 d4f3333 Add the save-flow UI and integration tests the plan names, and randomise when the mid-save edit happens
- T37 1012f62 Scan for editor components rendering their own dialog, test the theme switcher in both places, and drop the removed Drawer from the map
- T38 0966fde Keep the editor and its edits through the first Save after a create
- T39 d025364 Print an issued invoice opened in the editor with its stored amounts in the preview and in Download/Print
- T40 1d45e67 Reject every comma in AmountInput, as AC-13 is written
- T41 c3fd6a1 Show that the PDF is being prepared on the row menu and the editor buttons
- T42 7dda0c7 Make the PDF on-demand tests able to fail
- T43 43db102 Prove AC-06 hydration and AC-07 isolation through the client router
- T44 2b71edd Close the remaining save-flow, date and hygiene test gaps
- T45 56fc972 Fix the PDF failure tag, the number-hint sign-in, static-route caching and isSaving after dispose
- T46 fc03e39 Harden the nightly e2e and integration CI, and prove pnpm test:e2e on Linux at HEAD
- T47 6306fa7 Bring the SAD and the architecture map in line with the shipped code
- T45b 671ebaa Don't send the device to sign-in when the number-hint request was cut off by leaving the page
- T48 69d4f22 Show and announce that the PDF is being prepared on the phone editor, from a live region outside the buttons
- T49 55a578b Make the hand-over to the edit page after a create keep focus, scroll and in-flight edits, without Next internals
- T50 3c370b5 Make the toolkit-fetch tracker in the PDF on-demand e2e wait for its own handlers
- T51 5bdf5c3 Record the store hand-over in the ADRs and fix the remaining PDF wording in ux-flows and the SAD
- T52 c75ac1d Tidy the route JSDoc, verify the nightly Docker CLI download, reuse StoredAmounts and fix a stale test comment
- T53 0fac822 Make plain pnpm test:e2e pass on Linux and record the reviewed layout baselines
- T54 f52ed35 Restore focus after the create hand-over on every editor field, not only fields with an aria-label
- T55 ab74dc2 Guard the create hand-over: move only from the new or the edit address, and adopt an entry only once
- T56 88ac32b Make the 'no rebuild during the Save' e2e wait for a positive signal, and stop e2e watchers leaking rejections
- T57 1050f70 Stop the time-zone cookie refresh from cancelling the Freelancer's first navigation after sign-in
- T58 158b033 Keep the layout-baseline images under _audit, point the test plan at the current e2e log, and log plain pnpm test:e2e at the final HEAD
- T59 18faf71 Make the 'no rebuild during the Save' e2e wait for a server-rendered marker of the revalidated tree
- T60 36f99bd Refresh after writing the time-zone cookie only while the account has no saved zone
- T61 31f640e Name the tz cookie on the privacy page
- T62 2abfce7 Restore focus on the picker buttons after the create hand-over, and make the t44 second-adopter check observable
- T63 50cb3ea, 57957f1 Close the last e2e rejection leak, fix the T53 log and the test plan, and log plain pnpm test:e2e at the final HEAD
- T64 41b9d98 Give the phone 'View PDF' sheet's close button an announced 'Close preview' name, and test it
- T65 eae9dcf Record the tz cookie and the saved-zone check in the spec and SAD, record storedAmounts in the contracts, and close the currency-symbol question
- T66 22d1ff6, 775c376 Make the privacy page and the cookie banner list the cookies the app really sets
- T67 2a5df97, 696c0e6, 790c7cc Stop the losing cookie poll leaking a rejection in the first-navigation e2e, close its context in a finally, and log plain pnpm test:e2e at the final HEAD
- T68 98e46fb Add the 'line added' case to the AC-11 line-position test
- T69 87dd5f4 Remove the remaining 'nothing new sent', 'no contract change' and 'no service change' claims from the SAD and the data model
- T70 bd2278c Drop the authjs.state cookie the app never sets from the privacy page, and remove the unused import in the cookie banner
- T71 5a7b078 Rebuild the owner-review layout images at the final HEAD for all four baselines, and log plain pnpm test:e2e there
- T72 39f31f5 Record the new-invoice initialData pre-fill and the private layouts' saved-zone read in the SAD, data model and contract
- T73 3798749 Make the layout-baseline owner-review notes and the existing-invoice phone diff show the scrollbar thumb, and drop the 'under 1 point' claim
- T74 0b4f796 Test that a line moved to the first position with the keyboard announces 'line 1'
- T75 d3323a8 Correct the SAD's new-server-call, logging and Flow 5 default wording, and the T53 log's percentage note
- T76 7cf49ac Test that a failed invoice-number hint leaves the loading state for 'Assigned on save' at the same size
- T77 006d346 Make the captive-portal test-plan row match the code (newer version, Reload) and pin the test to Reload
- T78 bd914b9 Name the editor pages' session-actor lookup in the SAD's list of server-side changes
- T79 2197847 Assert that a rejected invoice-number hint request goes to sign-in, and separate it from the non-success case in the test plan
- T80 fed51a6 Word the 'not saved because issued' notice by what was dropped (the lines and other locked details), and assert that wording
- T81 da49ab9 Show the notice's 'kept for you to save' sentence only when an allowed field was edited
- T82 7ee896b Make the first-PDF timing rows in the test plan and SAD say what the test measures
- T83 6e46f69 Correct the SAD's building-block line for invoice-pdf-helpers (split, not removed)
- T84 f51c2ae Run the full Linux e2e suite at the final HEAD and point the test plan at that log
- T85 eea6a13 Drop the notice's 'kept for you to save' sentence once a later save leaves nothing unsaved
- T86 62b5952 Test a custom-price moment that falls on the previous day in a negative time zone
- T87 844dc80 Make five test-plan rows say what their tests assert (AC-01, AC-05c, AC-06, AC-14, double Download)
- T88 b507f6a Pin the line-only notice exactly in the e2e and list every user of the remaining PDF helpers in the SAD
- T89 b10c85f Run the full Linux e2e suite at the final HEAD after T85-T88 and point the test plan at that log
- T90 34ba1f3 Make the three edge-case rows match their tests: reword the Try-again row, edit the price in the two-edits test, and edit before Retry in the totals-cancel test
- T91 46384d4 Assert the line count and the Notes draft survive the AC-14 resizes, and make the test-plan row name the real sizes
- T92 8a80ece Run the full Linux e2e suite at the final HEAD after T90-T91 and point the test plan at that log
- T93 be71b0c Make the AC-06 component row cite the tests that check each part of the first render
- T94 308b5f2 Assert the totals confirmation leaves the DOM after Cancel and make the totals-cancel row say the notes edit stays in the form
- T95 2ed0e2b Assert the store state is unchanged when Retry is pressed while a save is running
- T96 ff28518 Point the editor-retry-parity e2e comment at the renamed retry-through-save-command test
- T97 672229d Make the AC-04 race row say the totals check covers edited states and a saved form shows the stored figures
- T98 1f67180 Assert the list row's Print shows and announces the preparing state, like Download
- T99 8ff3904 Assert focus and caret survive the create hand-over for every text and amount field
- T100 ba5d773 Render the preview from the real read side in pdf-fidelity and assert it matches the PDF line by line
- T101 dac430b Assert focus and caret survive the create hand-over for the custom line's Product name field
- T102 e19054e Make the AC-10 wording row name the rendering tests that prove the layouts carry no label text of their own
- T103 47969a0 Run the first-PDF timing e2e (E2E_TIMING=1) on Linux and keep the log as the NFR evidence

</details>

## Verification

All runs on `dff223d`, macOS, Node 22, Docker up.

- Unit + component + contract: `vitest` 211 files, 2016/2016 passed
- Integration (throwaway Postgres via testcontainers): 104 files, 937 passed; the 50 skipped are the "no container runtime" placeholders only
- Lint + typecheck: `tsc --noEmit` clean; `eslint` 0 errors, 4 warnings (none new)
- Dependency audit: `pnpm audit --prod --audit-level=high` — no high or critical advisory (2 low, 3 moderate)
- Build-output check: `pnpm check:pdf-chunks` — "30 routes checked, no toolkit leak"
- Ran the feature: `CI=1 pnpm test:e2e` built and started the real production app against a throwaway Postgres and drove it in Chromium and WebKit. 113 passed, 3 skipped. Observed:
  - **AC-01:** the dashboard, lists, Customer and sender profile pages opened with no toolkit request; the preview showed the invoice with no toolkit request; the first Download fetched it once, and a later Print and preview fetched nothing new.
  - **AC-02 / AC-02b:** with the network off, Download showed the try-again message and Try again worked once the network was back; with the toolkit chunk removed, Download showed the newer-version message and Reload recovered.
  - **AC-05c / AC-05d:** for all seven outcomes (created, updated, issued, changed elsewhere, totals changed, totals changed on issue, field error), Retry gave the same address, dialog and unsaved flag as Save.
  - **AC-07:** in Chromium and WebKit, after A signed out, neither a Visitor nor B saw A's invoice number through Back, Forward or A's editor address.
  - **AC-08:** with the Freelancer zone at UTC−10, UTC, UTC+14 and none saved, the browser in another zone and the clock at 23:55 and 00:05, every page showed the stored days.
  - **AC-09:** with the browser in `uk-UA` and `de-DE`, the editor, preview, PDF and Debtors showed "$1,234.50" and "UAH 1,234.50".
  - **AC-11:** axe found 0 serious or critical violations on the editor (new, existing, refused save; desktop and phone), the invoices list and the dashboard.
  - **AC-13 / AC-14:** at 390 px the server HTML was already the phone layout and did not change on hydration; "12." in a focused line field survived a breakpoint resize both ways.
  - **Skipped on macOS (by design):** the two layout-baseline comparisons (the baselines are Linux-only; their owner review, O2, was skipped by the owner) and the opt-in first-PDF timing run, recorded on Linux at p95 1107 ms against 3000 ms (`47969a0`, T103).
  - **Not verifiable here:** the real-iPhone keypad (O1, skipped by the owner) and the real-user layout-shift KPI (measured 14 days after release).

## Operational notes

- **Migration:** none.
- **Feature flag / config:** none. No new required setting.
- **Before the release:** record the 14-day baselines for render-mismatch errors and the p75 phone-width editor layout shift (spec §7).
- **CI:** no e2e in CI; run `CI=1 pnpm test:e2e` locally before each ship.
- **Rollback:** deploy the previous build. Nothing is stored, so the database needs no change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
