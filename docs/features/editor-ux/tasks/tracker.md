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
| T22 | Open a new invoice with the default sender profile, its default bank account and currency, and request the invoice-number hint on mount | app | Dmytro Hopko | — | — | todo |
| T23 | Print an issued invoice with its stored line amounts and totals in the preview and the PDF | domain | Dmytro Hopko | — | — | todo |
| T24 | Keep the failed intent through the changed-totals confirmation so Save and issue stays Save and issue | app | Dmytro Hopko | — | T21 | todo |
| T25 | Stop AmountInput from turning a typed comma decimal into a larger amount, and record the iPhone keypad check | ui | Dmytro Hopko | — | — | todo |
| T26 | Name the phone more-actions button and the line product fields, tie the product error to its field, and run axe at phone width and after a refused save | ui | Dmytro Hopko | — | — | todo |
| T27 | Show "Customer since" in the Freelancer time zone | ui | Dmytro Hopko | — | — | todo |
| T28 | Make every PDF action fail safely, show its preparing state, resist double clicks and popup blockers, and test the real triggers | ui | Dmytro Hopko | — | — | todo |
| T29 | Reword AC-01 and AC-02b for the HTML preview and remove the dead preview PDF action | docs | Dmytro Hopko | — | T28 | todo |
| T30 | Limit Cache-Control no-store to signed-in document and RSC responses | wiring | Dmytro Hopko | — | — | todo |
| T31 | Make the CI e2e job fail instead of skipping without Docker, add a nightly full e2e run, and harden the PDF chunk gate | tests | Dmytro Hopko | — | — | todo |
| T32 | Capture Linux layout baselines from main, cover a new invoice, and re-verify the README on a fresh clone including e2e | tests | Dmytro Hopko | — | T22 | todo |
| T33 | Prove AC-07 by navigating back to the earlier Freelancer's invoice, between two invoices, and by direct address after sign-out | tests | Dmytro Hopko | — | T30 | todo |
| T34 | Extend the date matrix to the preview, the PDF and a new invoice's today, with hard-coded expectations | tests | Dmytro Hopko | — | T22, T27 | todo |
| T35 | Prove money formatting independent of device language on the screens, and test parity against a really rendered PDF | tests | Dmytro Hopko | — | T23 | todo |
| T36 | Add the save-flow UI and integration tests the plan names, and randomise when the mid-save edit happens | tests | Dmytro Hopko | — | T21, T24 | todo |
| T37 | Scan for editor components rendering their own dialog, test the theme switcher in both places, and drop the removed Drawer from the map | tests | Dmytro Hopko | — | — | todo |

**Total:** 37 tasks (T21–T37 are follow-ups from review 2026-10-10).
