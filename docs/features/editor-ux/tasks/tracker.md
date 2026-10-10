# Tracker — editor-ux

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Move the PDF toolkit into one lazy lib/pdf module with a cached, classifying loader | app | Dmytro Hopko | M | — | done |
| T2 | Route every PDF trigger through usePdfAction and warm the toolkit in the editor when idle | ui | Dmytro Hopko | M | T1 | done |
| T3 | Add the build-output PDF chunk check to CI and e2e tests for first PDF, offline and new-version | tests | Dmytro Hopko | M | T2 | done |
| T4 | Remove the unused UI components and their packages, drop uuid, and keep one theme switcher | wiring | Dmytro Hopko | M | — | done |
| T5 | Mount the editor's confirmation dialog in the invoice-editor modal container | ui | Dmytro Hopko | S | — | done |
| T6 | Rewrite the README setup and test steps and verify them in a fresh clone | docs | Dmytro Hopko | S | — | done |
| T7 | Create the lib/format module for money, calendar days and moments with a fixed en-US locale | domain | Dmytro Hopko | S | — | done |
| T8 | Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint | ui | Dmytro Hopko | M | T7 | done |
| T9 | Build the pure invoice document model with its wording in lib/invoice-document | domain | Dmytro Hopko | M | T7 | done |
| T10 | Lay out the HTML preview and the PDF from the document model and add the parity test | ui | Dmytro Hopko | M | T1, T8, T9 | done |
| T11 | Turn the editor store into a per-mount factory provided by context and built from server data | app | Dmytro Hopko | L | T5, T8, T10 | done |
| T12 | Compute a new invoice's today and due date on the server and reserve the invoice-number field | app | Dmytro Hopko | S | T11 | done |
| T13 | Add the store save command with a form revision and resolve every save outcome in it | app | Dmytro Hopko | L | T11 | done |
| T14 | Route Retry, the created-address change and the save dialogs through the save command | app | Dmytro Hopko | M | T13 | done |
| T15 | Send signed-in pages no-store, reload back/forward-cache restores, and prove AC-07 in Chromium and WebKit | wiring | Dmytro Hopko | M | T11 | done |
| T16 | Give every editor field, line field, icon button and row action an announced name and tie errors to fields | ui | Dmytro Hopko | M | T11 | done |
| T17 | Render the editor's phone and desktop layouts from one DOM tree switched by CSS only | ui | Dmytro Hopko | M | T11 | done |
| T18 | Add the shared AmountInput with a decimal keypad and use it for line, discount, tax and shipping fields | ui | Dmytro Hopko | S | T8, T11 | done |
| T19 | Add the CI e2e job with the server/browser date matrix and the accessibility suite | tests | Dmytro Hopko | M | T8, T12, T16 | done |
| T20 | Add e2e tests that reach every save outcome by Save and by Retry and compare the results | tests | Dmytro Hopko | S | T14 | done |
| T21 | Dispose the editor store on unmount so Retry and an in-flight create cannot act on another page, and remove the unused save-bypassing actions | app | Dmytro Hopko | — | — | done |
| T22 | Open a new invoice with the default sender profile, its default bank account and currency, and request the invoice-number hint on mount | app | Dmytro Hopko | — | — | done |
| T23 | Print an issued invoice with its stored line amounts and totals in the preview and the PDF | domain | Dmytro Hopko | — | — | done |
| T24 | Keep the failed intent through the changed-totals confirmation so Save and issue stays Save and issue | app | Dmytro Hopko | — | T21 | done |
| T25 | Stop AmountInput from turning a typed comma decimal into a larger amount, and record the iPhone keypad check | ui | Dmytro Hopko | — | owner: iPhone (Ukrainian region) keypad check, before ship | blocked |
| T26 | Name the phone more-actions button and the line product fields, tie the product error to its field, and run axe at phone width and after a refused save | ui | Dmytro Hopko | — | — | done |
| T27 | Show "Customer since" in the Freelancer time zone | ui | Dmytro Hopko | — | — | done |
| T28 | Make every PDF action fail safely, show its preparing state, resist double clicks and popup blockers, and test the real triggers | ui | Dmytro Hopko | — | — | done |
| T29 | Reword AC-01 and AC-02b for the HTML preview and remove the dead preview PDF action | docs | Dmytro Hopko | — | T28 | done |
| T30 | Limit Cache-Control no-store to signed-in document and RSC responses | wiring | Dmytro Hopko | — | — | done |
| T31 | Make the CI e2e job fail instead of skipping without Docker, add a nightly full e2e run, and harden the PDF chunk gate | tests | Dmytro Hopko | — | — | done |
| T32 | Capture Linux layout baselines from main, cover a new invoice, and re-verify the README on a fresh clone including e2e | tests | Dmytro Hopko | — | T22 | done |
| T33 | Prove AC-07 by navigating back to the earlier Freelancer's invoice, between two invoices, and by direct address after sign-out | tests | Dmytro Hopko | — | T30 | done |
| T33b | Prove AC-07 on a restored (bfcache) page: no-store and the restore guard keep A's invoice off screen | tests | Dmytro Hopko | — | T33 | done |
| T34 | Extend the date matrix to the preview, the PDF and a new invoice's today, with hard-coded expectations | tests | Dmytro Hopko | — | T22, T27 | done |
| T35 | Prove money formatting independent of device language on the screens, and test parity against a really rendered PDF | tests | Dmytro Hopko | — | T23 | done |
| T36 | Add the save-flow UI and integration tests the plan names, and randomise when the mid-save edit happens | tests | Dmytro Hopko | — | T21, T24 | done |
| T37 | Scan for editor components rendering their own dialog, test the theme switcher in both places, and drop the removed Drawer from the map | tests | Dmytro Hopko | — | — | done |
| T38 | Keep the editor and its edits through the first Save after a create | app | Dmytro Hopko | — | — | done |
| T39 | Print an issued invoice opened in the editor with its stored amounts in the preview and in Download/Print | ui | Dmytro Hopko | — | — | done |
| T40 | Reject every comma in AmountInput, as AC-13 is written | ui | Dmytro Hopko | — | — | done |
| T41 | Show that the PDF is being prepared on the row menu and the editor buttons | ui | Dmytro Hopko | — | — | done |
| T42 | Make the PDF on-demand tests able to fail | tests | Dmytro Hopko | — | T41 | done |
| T43 | Prove AC-06 hydration and AC-07 isolation through the client router | tests | Dmytro Hopko | — | T38 | done |
| T44 | Close the remaining save-flow, date and hygiene test gaps | tests | Dmytro Hopko | — | T38 | done |
| T45 | Fix the PDF failure tag, the number-hint sign-in, static-route caching and isSaving after dispose | app | Dmytro Hopko | — | — | done |
| T45b | Don't send the device to sign-in when the number-hint request was cut off by leaving the page | app | Dmytro Hopko | — | T45 | done |
| T46 | Harden the nightly e2e and integration CI, and prove pnpm test:e2e on Linux at HEAD | infra | Dmytro Hopko | — | T38, T39, T40, T41, T42, T43, T44, T45 | done |
| T47 | Bring the SAD and the architecture map in line with the shipped code | docs | Dmytro Hopko | — | — | done |
| T48 | Show and announce that the PDF is being prepared on the phone editor, from a live region outside the buttons | ui | Dmytro Hopko | — | — | done |
| T49 | Make the hand-over to the edit page after a create keep focus, scroll and in-flight edits, without Next internals | app | Dmytro Hopko | — | — | done |
| T50 | Make the toolkit-fetch tracker in the PDF on-demand e2e wait for its own handlers | tests | Dmytro Hopko | — | — | done |
| T51 | Record the store hand-over in the ADRs and fix the remaining PDF wording in ux-flows and the SAD | docs | Dmytro Hopko | — | T49 | done |
| T52 | Tidy the route JSDoc, verify the nightly Docker CLI download, reuse StoredAmounts and fix a stale test comment | wiring | Dmytro Hopko | — | — | done |
| T53 | Make plain pnpm test:e2e pass on Linux and record the reviewed layout baselines | infra | Dmytro Hopko | — | T48, T49, T50, T51, T52 | review |
| T54 | Restore focus after the create hand-over on every editor field, not only fields with an aria-label | app | Dmytro Hopko | — | — | done |
| T55 | Guard the create hand-over: move only from the new or the edit address, and adopt an entry only once | app | Dmytro Hopko | — | T54 | done |
| T56 | Make the 'no rebuild during the Save' e2e wait for a positive signal, and stop e2e watchers leaking rejections | tests | Dmytro Hopko | — | — | done |
| T57 | Stop the time-zone cookie refresh from cancelling the Freelancer's first navigation after sign-in | app | Dmytro Hopko | — | — | done |
| T58 | Keep the layout-baseline images under _audit, point the test plan at the current e2e log, and log plain pnpm test:e2e at the final HEAD | docs | Dmytro Hopko | — | T54, T55, T56, T57 | done |
| T59 | Make the 'no rebuild during the Save' e2e wait for a server-rendered marker of the revalidated tree | tests | Dmytro Hopko | — | — | done |
| T60 | Refresh after writing the time-zone cookie only while the account has no saved zone | app | Dmytro Hopko | — | — | done |
| T61 | Name the tz cookie on the privacy page | ui | Dmytro Hopko | — | T60 | done |
| T62 | Restore focus on the picker buttons after the create hand-over, and make the t44 second-adopter check observable | app | Dmytro Hopko | — | — | done |
| T63 | Close the last e2e rejection leak, fix the T53 log and the test plan, and log plain pnpm test:e2e at the final HEAD | tests | Dmytro Hopko | — | T59, T60, T61, T62 | done |
| T64 | Give the phone 'View PDF' sheet's close button an announced 'Close preview' name, and test it | ui | Dmytro Hopko | — | — | done |
| T65 | Record the tz cookie and the saved-zone check in the spec and SAD, record storedAmounts in the contracts, and close the currency-symbol question | docs | Dmytro Hopko | — | — | done |
| T66 | Make the privacy page and the cookie banner list the cookies the app really sets | ui | Dmytro Hopko | — | — | done |
| T67 | Stop the losing cookie poll leaking a rejection in the first-navigation e2e, close its context in a finally, and log plain pnpm test:e2e at the final HEAD | tests | Dmytro Hopko | — | T64, T65, T66 | done |
| T68 | Add the 'line added' case to the AC-11 line-position test | tests | Dmytro Hopko | — | — | done |
| T69 | Remove the remaining 'nothing new sent', 'no contract change' and 'no service change' claims from the SAD and the data model | docs | Dmytro Hopko | — | — | done |
| T70 | Drop the authjs.state cookie the app never sets from the privacy page, and remove the unused import in the cookie banner | ui | Dmytro Hopko | — | — | done |
| T71 | Rebuild the owner-review layout images at the final HEAD for all four baselines, and log plain pnpm test:e2e there | infra | Dmytro Hopko | — | T68, T69, T70 | done |
| T72 | Record the new-invoice initialData pre-fill and the private layouts' saved-zone read in the SAD, data model and contract | docs | Dmytro Hopko | — | — | done |
| T73 | Make the layout-baseline owner-review notes and the existing-invoice phone diff show the scrollbar thumb, and drop the 'under 1 point' claim | infra | Dmytro Hopko | — | T72, T74 | done |
| T74 | Test that a line moved to the first position with the keyboard announces 'line 1' | tests | Dmytro Hopko | — | — | done |
| T75 | Correct the SAD's new-server-call, logging and Flow 5 default wording, and the T53 log's percentage note | docs | Dmytro Hopko | — | — | done |
| T76 | Test that a failed invoice-number hint leaves the loading state for 'Assigned on save' at the same size | tests | Dmytro Hopko | — | — | done |
| T77 | Make the captive-portal test-plan row match the code (newer version, Reload) and pin the test to Reload | tests | Dmytro Hopko | — | — | done |
| T78 | Name the editor pages' session-actor lookup in the SAD's list of server-side changes | docs | Dmytro Hopko | — | — | done |
| T79 | Assert that a rejected invoice-number hint request goes to sign-in, and separate it from the non-success case in the test plan | tests | Dmytro Hopko | — | — | done |
| T80 | Word the 'not saved because issued' notice by what was dropped (the lines and other locked details), and assert that wording | app | Dmytro Hopko | — | — | done |

**Total:** 82 tasks (T21–T37 are follow-ups from review 2026-10-10; T38–T47 and T45b from review 2026-10-10-r2; T48–T53 from review 2026-10-10-r3; T54–T58 from review 2026-10-10-r4; T59–T63 from review 2026-10-10-r5; T64–T67 from review 2026-10-10-r6; T68–T71 from review 2026-10-10-r7; T72–T74 from review 2026-10-11-r8; T75–T77 from review 2026-10-11-r9; T78–T80 from review 2026-10-11-r10).
