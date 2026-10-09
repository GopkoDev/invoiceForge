# Tracker — editor-ux

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Move the PDF toolkit into one lazy lib/pdf module with a cached, classifying loader | app | Dmytro Hopko | M | — | done |
| T2 | Route every PDF trigger through usePdfAction and warm the toolkit in the editor when idle | ui | Dmytro Hopko | M | T1 | done |
| T3 | Add the build-output PDF chunk check to CI and e2e tests for first PDF, offline and new-version | tests | Dmytro Hopko | M | T2 | done |
| T4 | Remove the unused UI components and their packages, drop uuid, and keep one theme switcher | wiring | Dmytro Hopko | M | — | todo |
| T5 | Mount the editor's confirmation dialog in the invoice-editor modal container | ui | Dmytro Hopko | S | — | todo |
| T6 | Rewrite the README setup and test steps and verify them in a fresh clone | docs | Dmytro Hopko | S | — | todo |
| T7 | Create the lib/format module for money, calendar days and moments with a fixed en-US locale | domain | Dmytro Hopko | S | — | todo |
| T8 | Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint | ui | Dmytro Hopko | M | T7 | todo |
| T9 | Build the pure invoice document model with its wording in lib/invoice-document | domain | Dmytro Hopko | M | T7 | todo |
| T10 | Lay out the HTML preview and the PDF from the document model and add the parity test | ui | Dmytro Hopko | M | T1, T8, T9 | todo |
| T11 | Turn the editor store into a per-mount factory provided by context and built from server data | app | Dmytro Hopko | L | T5, T8, T10 | todo |
| T12 | Compute a new invoice's today and due date on the server and reserve the invoice-number field | app | Dmytro Hopko | S | T11 | todo |
| T13 | Add the store save command with a form revision and resolve every save outcome in it | app | Dmytro Hopko | L | T11 | todo |
| T14 | Route Retry, the created-address change and the save dialogs through the save command | app | Dmytro Hopko | M | T13 | todo |
| T15 | Send signed-in pages no-store, reload back/forward-cache restores, and prove AC-07 in Chromium and WebKit | wiring | Dmytro Hopko | M | T11 | todo |
| T16 | Give every editor field, line field, icon button and row action an announced name and tie errors to fields | ui | Dmytro Hopko | M | T11 | todo |
| T17 | Render the editor's phone and desktop layouts from one DOM tree switched by CSS only | ui | Dmytro Hopko | M | T11 | todo |
| T18 | Add the shared AmountInput with a decimal keypad and use it for line, discount, tax and shipping fields | ui | Dmytro Hopko | S | T8, T11 | todo |
| T19 | Add the CI e2e job with the server/browser date matrix and the accessibility suite | tests | Dmytro Hopko | M | T8, T12, T16 | todo |
| T20 | Add e2e tests that reach every save outcome by Save and by Retry and compare the results | tests | Dmytro Hopko | S | T14 | todo |

**Total:** 20 tasks, ~17 person-days.
