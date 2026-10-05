# Tracker — mcp-server

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Promote the five staged migrations and extend the test support for keys, usage and time zone](./t01-promote-migrations-and-test-support.md) | migration | Dmytro Hopko | M | — | done |
| T02 | [Add the shared overdue rule module with its SQL, Prisma and TypeScript forms](./t02-shared-overdue-rule.md) | domain | Dmytro Hopko | M | — | done |
| T03 | [Generate, checksum and digest ifk_ Personal keys](./t03-personal-key-format.md) | domain | Dmytro Hopko | S | — | done |
| T04 | [Read the Freelancer time zone from the account in both ActingFreelancer factories and save it from settings](./t04-account-time-zone.md) | app | Dmytro Hopko | M | T01 | done |
| T05 | [Add the Time zone card to Profile settings](./t05-time-zone-settings-card.md) | ui | Dmytro Hopko | S | T04 | done |
| T06 | [Apply the shared overdue rule to every dashboard figure and show tabs for issued-invoice currencies](./t06-dashboard-overdue-rule-and-currency-tabs.md) | app | Dmytro Hopko | M | T02 | done |
| T07 | [Return the derived status from every invoice read and filter by the shared rule](./t07-derived-invoice-status.md) | app | Dmytro Hopko | M | T02 | done |
| T08 | [Show the derived overdue status on the invoice list, customer page, invoice page and recent invoices](./t08-derived-overdue-on-screens.md) | ui | Dmytro Hopko | S | T06, T07 | done |
| T09 | [Create, list and revoke Personal keys through the business layer and server actions](./t09-personal-key-management.md) | app | Dmytro Hopko | M | T01, T03 | done |
| T10 | [Add the per-key and per-source MCP limit scopes that fail closed](./t10-mcp-limit-scopes.md) | infra | Dmytro Hopko | S | T01 | done |
| T11 | [Authenticate a presented Personal key and record its last use and weekly usage](./t11-key-authentication-and-usage.md) | app | Dmytro Hopko | M | T01, T03, T04 | done |
| T12 | [Serve POST /api/mcp behind its single proxy exception with the source-limit, key-check and key-limit pipeline](./t12-mcp-endpoint-and-request-pipeline.md) | ports | Dmytro Hopko | M | T10, T11 | done |
| T13 | [Shape MCP answers, register read-only tools and count substantive calls](./t13-mcp-answers-and-tool-registry.md) | ports | Dmytro Hopko | M | T12 | done |
| T14 | [Page overdue invoices and Debtors strictly with totals over every match](./t14-strict-paging-overdue-and-debtors.md) | app | Dmytro Hopko | M | T06 | done |
| T15 | [Page Expected payments by period and compute summary figures for every issued-invoice currency](./t15-expected-payments-and-summary-reads.md) | app | Dmytro Hopko | M | T14 | done |
| T16 | [Match Customers by current and invoice-copied names and search issued invoices for an Assistant](./t16-customer-match-and-invoice-search.md) | app | Dmytro Hopko | M | T07, T14 | done |
| T17 | [Find one invoice by id or by number with an optional sender profile name](./t17-find-invoice-by-reference.md) | app | Dmytro Hopko | M | T16 | done |
| T18 | [Expose the overdue, Debtors, Expected payments and summary figures tools](./t18-aggregate-tools.md) | ports | Dmytro Hopko | M | T13, T14, T15 | done |
| T19 | [Expose the customers, invoice search and one-invoice tools](./t19-lookup-tools.md) | ports | Dmytro Hopko | M | T13, T16, T17 | done |
| T20 | [Add the Connect your AI settings page with setup steps, example prompts and a CopyButton](./t20-connect-page-shell-and-setup.md) | ui | Dmytro Hopko | M | — | done |
| T21 | [Build key creation, the one-time reveal, the key lists and revoke confirmation on Connect your AI](./t21-key-create-reveal-and-revoke-ui.md) | ui | Dmytro Hopko | M | T09, T20 | done |
| T22 | [Show the overdue-rule notice and the Connect your AI entry point on the dashboard](./t22-dashboard-notice-and-entry-point.md) | ui | Dmytro Hopko | M | T01, T09, T20 | done |
| T23 | [Add Personal keys, weekly usage and the time zone to the data export and verify deletion removes them](./t23-export-and-account-deletion.md) | app | Dmytro Hopko | S | T01 | done |
| T24 | [Prove Assistant-dashboard parity, day boundaries, tenant isolation and the latency budget end to end](./t24-parity-boundary-isolation-and-scale.md) | tests | Dmytro Hopko | M | T18, T19 | done |
| T25 | [Store issue and due dates as calendar days and compare every period and the overdue rule by calendar day](../_review/review-2026-10-05.md) | data | Dmytro Hopko | L | — | done |
| T26 | [Keep the stored status through an editor save of a derived-overdue invoice](../_review/review-2026-10-05.md) | app | Dmytro Hopko | S | — | done |
| T27 | [Refuse JSON-RPC batches and cap the MCP request body before the transport](../_review/review-2026-10-05.md) | ports | Dmytro Hopko | S | — | done |
| T28 | [Build dashboard and invoice-list periods from the account time zone](../_review/review-2026-10-05.md) | app | Dmytro Hopko | S | — | done |
| T29 | [Match the contract's InvoiceCandidate and ServerFailure, report route failures, accept any-case Bearer, drop dead paging code](../_review/review-2026-10-05.md) | ports | Dmytro Hopko | M | — | done |
| T30 | [Answer a key-check store failure with 503 and prove last use on tools/list and on a refused call](../_review/review-2026-10-05.md) | app | Dmytro Hopko | S | — | done |
| T31 | [Leave cancelled-only currencies out of summary currencies and dashboard tabs](../_review/review-2026-10-05.md) | app | Dmytro Hopko | S | T25 | done |
| T32 | [Guard the overdue literal scan without obfuscation and validate the real 2.1 export body](../_review/review-2026-10-05.md) | tests | Dmytro Hopko | S | — | done |
| T33 | [Polish the key-name hint, revoke focus and time-zone labels, and test the one-time reveal on remount](../_review/review-2026-10-05.md) | ui | Dmytro Hopko | M | — | done |
| T34 | [Add the e2e specs the test plan declares for the proxy, key flows, sign-in return, time zone and overdue surfaces](../_review/review-2026-10-05.md) | tests | Dmytro Hopko | L | T25, T26, T28 | done |
| T35 | [Normalise legacy invoice dates lazily when the Freelancer time zone is first saved](../_review/review-2026-10-05.md) | data | Dmytro Hopko | M | — | done |
| T36 | [Build dashboard presets and the applied-range label in the account time zone](../_review/review-2026-10-05.md) | ui | Dmytro Hopko | M | — | done |
| T37 | [Keep request bodies out of Sentry, check Accept and Content-Type first, and put 413 and the batch refusal in the contract](../_review/review-2026-10-05.md) | ports | Dmytro Hopko | S | — | done |
| T38 | [Map a submitted OVERDUE back to PENDING only for a derived-overdue invoice](../_review/review-2026-10-05.md) | app | Dmytro Hopko | S | — | done |
| T39 | [Give the no-zone, export-schema, revoke-title and overdue-surface tests teeth](../_review/review-2026-10-05.md) | tests | Dmytro Hopko | M | T35 | done |
| T40 | [Keep unedited legacy invoice dates through an editor save, seed the zone from the editor, and accept only calendar-day strings on the server](../_review/review-2026-10-05-r2.md) | app | Dmytro Hopko | M | — | todo |
| T41 | [Keep MCP request data out of Sentry transactions, report SDK failures, treat client aborts as client errors, and return the contract 405 body](../_review/review-2026-10-05-r2.md) | ports | Dmytro Hopko | M | — | todo |
| T42 | [Label dashboard chart days as calendar days, resolve presets on the server, show the applied preset, and keep focus after a not-found revoke](../_review/review-2026-10-05-r2.md) | ui | Dmytro Hopko | M | — | todo |
| T43 | [Bring the ADRs, contracts, data model, screens manifest and test plan in line with the fixes](../_review/review-2026-10-05-r2.md) | docs | Dmytro Hopko | S | T40, T41, T42 | todo |

**Total:** 43 tasks (T25–T34 from review-2026-10-05, T35–T39 from its implement-run addendum, T40–T43 from review-2026-10-05-r2), ~31.5 person-days (S = ½ day, M = 1 day, L ≈ 1.5 days).
