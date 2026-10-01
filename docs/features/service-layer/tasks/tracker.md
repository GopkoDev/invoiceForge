# Tracker — service-layer

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Enforce the lib/services boundary: server-only, lint rules, boundary test, build in CI | wiring | Dmytro Hopko | S | — | done |
| T2 | Move the result contract and result helpers into the shared business-layer kernel | domain | Dmytro Hopko | S | T1 | done |
| T3 | Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution | domain | Dmytro Hopko | M | T2 | done |
| T4 | Add the shared ListQuery schema, the Page envelope and the paginate helper | domain | Dmytro Hopko | S | T2 | done |
| T5 | Wrap the current dashboard actions in dashboard.<section> Sentry spans to start the latency baseline | wiring | Dmytro Hopko | S | — | done |
| T6 | Move customers into lib/services/customers with search, paging and owner-scoped writes | app | Dmytro Hopko | M | T3, T4 | done |
| T7 | Move products into lib/services/products with search, paging and owner-scoped writes | app | Dmytro Hopko | M | T3, T4 | done |
| T8 | Move custom prices into lib/services/custom-prices with parent-scoped lists and owner-scoped writes | app | Dmytro Hopko | M | T3, T4 | done |
| T9 | Move sender profiles into lib/services/sender-profiles and route the convert-image logo lookup through it | app | Dmytro Hopko | M | T3, T4 | done |
| T10 | Move bank accounts into lib/services/bank-accounts with a parent-scoped list | app | Dmytro Hopko | M | T3, T4 | done |
| T11 | Move profile, account deletion, data export and the dashboard setup check into the layer | app | Dmytro Hopko | M | T3 | done |
| T12 | Move invoice numbering, getInvoice, the editor data and the next-number preview into lib/services/invoices | app | Dmytro Hopko | M | T3 | todo |
| T13 | Add listInvoices with validated filters and local-date bounds, and delete the unused list-all function | app | Dmytro Hopko | M | T3, T4, T12 | todo |
| T14 | Move createInvoice into the layer with owned references and numbering under the row lock | app | Dmytro Hopko | M | T12 | todo |
| T15 | Move updateInvoice and updateInvoiceStatus into the layer with the totals check and the paid-date rule | app | Dmytro Hopko | M | T14 | todo |
| T16 | Move duplicateInvoice and deleteInvoice into the layer | app | Dmytro Hopko | S | T14 | todo |
| T17 | Build the dashboard SQL for currency tabs, summary stats and the chart, with the old-vs-new parity harness | app | Dmytro Hopko | M | T3, T5 | todo |
| T18 | Build the dashboard SQL for sender accounts, recent invoices, Debtors and Expected payments | app | Dmytro Hopko | M | T17 | todo |
| T19 | Switch the dashboard wrappers to the layer, pass local-date periods, record parity values and delete the in-memory code | ports | Dmytro Hopko | M | T18 | todo |
| T20 | Close the move: zero data-store calls in lib/actions, inventory checks for request-free and foreign-record tests | tests | Dmytro Hopko | S | T6–T13, T15, T16, T19 | todo |

**Total:** 20 tasks, ~17 person-days (S ≈ 0.5 d, M ≈ 1 d).
