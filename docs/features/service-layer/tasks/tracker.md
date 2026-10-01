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
| T12 | Move invoice numbering, getInvoice, the editor data and the next-number preview into lib/services/invoices | app | Dmytro Hopko | M | T3 | done |
| T13 | Add listInvoices with validated filters and local-date bounds, and delete the unused list-all function | app | Dmytro Hopko | M | T3, T4, T12 | done |
| T14 | Move createInvoice into the layer with owned references and numbering under the row lock | app | Dmytro Hopko | M | T12 | done |
| T15 | Move updateInvoice and updateInvoiceStatus into the layer with the totals check and the paid-date rule | app | Dmytro Hopko | M | T14 | done |
| T16 | Move duplicateInvoice and deleteInvoice into the layer | app | Dmytro Hopko | S | T14 | done |
| T17 | Build the dashboard SQL for currency tabs, summary stats and the chart, with the old-vs-new parity harness | app | Dmytro Hopko | M | T3, T5 | done |
| T18 | Build the dashboard SQL for sender accounts, recent invoices, Debtors and Expected payments | app | Dmytro Hopko | M | T17 | done |
| T19 | Switch the dashboard wrappers to the layer, pass local-date periods, record parity values and delete the in-memory code | ports | Dmytro Hopko | M | T18 | done |
| T20 | Close the move: zero data-store calls in lib/actions, inventory checks for request-free and foreign-record tests | tests | Dmytro Hopko | S | T6–T13, T15, T16, T19 | done |
| T21 | [Harden list input and ordering: own-key status check, page bounds, literal search wildcards, id tiebreak on editor data and filter options](../_review/review-2026-10-01.md) | app | Dmytro Hopko | S | T13 | todo |
| T22 | [Put the owner in the where clause of numbering, the invoice-items delete, the bank-account default reset and the custom-price lists (ADR-0003)](../_review/review-2026-10-01.md) | app | Dmytro Hopko | M | T8, T10, T14, T15 | todo |
| T23 | [Restore wrapper parity: currency-tab creation order, preview lists without a limit, one Sentry event per logo failure, the shared session factory and the route time-zone fallback](../_review/review-2026-10-01.md) | ports | Dmytro Hopko | M | T3, T8–T10, T13, T19 | todo |
| T24 | [Pin the untested promises: foreign sender profile on update, every invoice sort, the sender-name and in-period naming rule, record identity in the parity snapshot](../_review/review-2026-10-01.md) | tests | Dmytro Hopko | S | T13, T15, T18, T19 | todo |
| T25 | [Cut the services-to-actions import edge: import helpers and numbering from lib/services, move select-queries into the layer, delete the shims](../_review/review-2026-10-01.md) | wiring | Dmytro Hopko | S | T20, T22 | todo |

**Total:** 25 tasks (T21–T25 are review follow-ups from `_review/review-2026-10-01.md`), ~20.5 person-days (S ≈ 0.5 d, M ≈ 1 d).
